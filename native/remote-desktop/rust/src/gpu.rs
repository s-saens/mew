use libloading::Library;
use serde::{Deserialize, Serialize};
use std::{ffi::c_void, path::Path};

pub const MAX_FRAME: usize = 4 * 1024 * 1024;
#[repr(C)]
#[derive(Default, Clone, Copy, Serialize)]
pub struct Screen {
    pub id: i32,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub reserved: i32,
}
impl Screen {
    pub fn json(&self) -> serde_json::Value {
        serde_json::json!({"id":format!("gpu:{}", self.id as u32),"label":if self.id == 99 { "Mew 가상 화면".into() } else { format!("화면 {}", self.id as u32 + 1) },"x":self.x,"y":self.y,"width":self.width,"height":self.height})
    }
}
#[repr(C)]
#[derive(Default, Clone, Copy)]
pub struct Meta {
    pub length: i32,
    pub width: i32,
    pub height: i32,
    pub key: i32,
    pub timestamp: i64,
    pub encode_us: i32,
    pub capture_us: i32,
    pub options: u32,
    pub bitrate: i32,
}
#[derive(Clone, Deserialize, Serialize)]
pub struct Mode {
    pub width: i32,
    pub height: i32,
    pub fps: i32,
    pub bitrate: i32,
    pub profile: String,
    pub level: i32,
    pub payload: u8,
    #[serde(default)]
    pub priority: String,
}
impl Mode {
    pub fn validate(&self) -> Result<(), String> {
        if !(2..=3840).contains(&self.width)
            || !(2..=2160).contains(&self.height)
            || !(1..=240).contains(&self.fps)
            || !(350_000..=50_000_000).contains(&self.bitrate)
            || !matches!(self.profile.as_str(), "high" | "baseline")
            || ![31, 32, 40, 41, 42, 50, 51, 52, 60, 61, 62].contains(&self.level)
            || !(96..=127).contains(&self.payload)
        {
            return Err("Invalid negotiated video mode".into());
        }
        Ok(())
    }
}

type Handle = *mut c_void;
type Unary = unsafe extern "C" fn(Handle);
type Poll = unsafe extern "C" fn(Handle, *mut u8, i32, *mut Meta) -> i32;

/// The library and every GPU handle stay on the Rust video thread. COM and OS
/// surface lifetime rules remain owned by the existing platform implementation.
pub struct Gpu {
    library: Library,
    handle: Handle,
    poll: Poll,
    destroy: Unary,
    pub active: bool,
    applied_rate: Option<i32>,
    #[cfg(windows)]
    precise_timer: bool,
}
impl Gpu {
    pub fn open(directory: &str) -> Result<Self, String> {
        let name = if cfg!(windows) {
            "gpu-windows.dll"
        } else if cfg!(target_os = "macos") {
            "gpu-macos.dylib"
        } else {
            "gpu-linux.so"
        };
        unsafe {
            let library =
                Library::new(Path::new(directory).join(name)).map_err(|e| e.to_string())?;
            let abi = library
                .get::<unsafe extern "C" fn() -> i32>(b"mew_gpu_abi\0")
                .map_err(|e| e.to_string())?();
            if abi != if cfg!(windows) { 5 } else { 2 } {
                return Err("GPU ABI mismatch; prepare the helper again".into());
            }
            // Resolve all required symbols before acquiring a GPU handle.
            let poll = *library
                .get::<Poll>(b"mew_gpu_poll\0")
                .map_err(|e| e.to_string())?;
            let destroy = *library
                .get::<Unary>(b"mew_gpu_destroy\0")
                .map_err(|e| e.to_string())?;
            let handle = library
                .get::<unsafe extern "C" fn() -> Handle>(b"mew_gpu_create\0")
                .map_err(|e| e.to_string())?();
            if handle.is_null() {
                return Err(
                    "GPU preparation failed; check login desktop and hardware H.264".into(),
                );
            }
            Ok(Self {
                library,
                handle,
                poll,
                destroy,
                active: false,
                applied_rate: None,
                #[cfg(windows)]
                precise_timer: false,
            })
        }
    }
    unsafe fn function<T: Copy>(&self, name: &[u8]) -> Result<T, String> {
        self.library
            .get::<T>(name)
            .map(|f| *f)
            .map_err(|e| e.to_string())
    }
    pub fn screens(&self) -> Result<Vec<Screen>, String> {
        unsafe {
            #[cfg(windows)]
            if self.function::<unsafe extern "C" fn(Handle) -> i32>(b"mew_gpu_refresh\0")?(
                self.handle,
            ) != 0
            {
                return Err("Display refresh failed".into());
            }
            let mut screens = [Screen::default(); 32];
            let count = self.function::<unsafe extern "C" fn(Handle, *mut Screen, i32) -> i32>(
                b"mew_gpu_screens\0",
            )?(self.handle, screens.as_mut_ptr(), 32);
            if !(0..=32).contains(&count) {
                return Err("Display enumeration failed".into());
            }
            Ok(screens[..count as usize].to_vec())
        }
    }
    pub fn start(
        &mut self,
        id: i32,
        mode: &Mode,
        source: &serde_json::Value,
    ) -> Result<Screen, String> {
        #[cfg(windows)]
        let _ = source;
        mode.validate()?;
        self.stop()?;
        unsafe {
            #[cfg(not(windows))]
            {
                if cfg!(target_os = "linux") && source.get("bounds").is_some() {
                    let b = &source["bounds"];
                    let read = |key: &str| {
                        b[key]
                            .as_i64()
                            .and_then(|n| i32::try_from(n).ok())
                            .ok_or_else(|| "Invalid portal bounds".to_string())
                    };
                    let set = self
                        .function::<unsafe extern "C" fn(Handle, i32, i32, i32, i32) -> i32>(
                            b"mew_gpu_source\0",
                        )?;
                    if set(
                        self.handle,
                        read("x")?,
                        read("y")?,
                        read("width")?,
                        read("height")?,
                    ) != 0
                    {
                        return Err("Portal source configuration failed".into());
                    }
                }
            }
            let profile = if mode.profile == "high" { 100 } else { 66 };
            #[cfg(windows)]
            let status = self.function::<unsafe extern "C" fn(
                Handle,
                i32,
                i32,
                i32,
                i32,
                i32,
                i32,
                i32,
            ) -> i32>(b"mew_gpu_start\0")?(
                self.handle,
                id,
                mode.width,
                mode.height,
                mode.fps,
                mode.bitrate,
                profile,
                mode.level,
            );
            #[cfg(not(windows))]
            let status = self.function::<unsafe extern "C" fn(
                Handle,
                i32,
                i32,
                i32,
                i32,
                i32,
                i32,
                u32,
                i32,
                i32,
            ) -> i32>(b"mew_gpu_start\0")?(
                self.handle,
                id,
                mode.width,
                mode.height,
                mode.fps,
                mode.bitrate,
                source["fd"].as_i64().unwrap_or(-1) as i32,
                source["node"].as_u64().unwrap_or(0) as u32,
                profile,
                mode.level,
            );
            // A failed start can still own partially initialized native resources.
            self.active = true;
            if status != 0 {
                self.stop()?;
                return Err("Hardware encoder rejected video mode".into());
            }
            let mut screen = Screen::default();
            if self.function::<unsafe extern "C" fn(Handle, *mut Screen) -> i32>(
                b"mew_gpu_current\0",
            )?(self.handle, &mut screen)
                != 0
            {
                self.stop()?;
                return Err("Current display unavailable".into());
            }
            self.applied_rate = Some(mode.bitrate);
            #[cfg(windows)]
            {
                self.precise_timer = power(true, false);
            }
            Ok(screen)
        }
    }
    pub fn read(&self, buffer: &mut [u8]) -> Result<Option<(usize, Meta)>, String> {
        let mut meta = Meta::default();
        let length = unsafe {
            (self.poll)(
                self.handle,
                buffer.as_mut_ptr(),
                buffer.len() as i32,
                &mut meta,
            )
        };
        if length < 0 || length as usize > buffer.len() {
            return Err("Native capture/encoder failed".into());
        }
        if length == 0 {
            return Ok(None);
        }
        if meta.width < 2 || meta.height < 2 || meta.timestamp < 0 {
            return Err("Invalid encoded frame metadata".into());
        }
        Ok(Some((length as usize, meta)))
    }
    pub fn keyframe(&self) -> Result<(), String> {
        unsafe {
            #[cfg(windows)]
            {
                self.function::<unsafe extern "C" fn(Handle) -> i32>(b"mew_gpu_keyframe\0")?(
                    self.handle,
                );
            }
            #[cfg(not(windows))]
            self.function::<Unary>(b"mew_gpu_keyframe\0")?(self.handle);
        }
        Ok(())
    }
    pub fn bitrate(&mut self, rate: i32) -> Result<(), String> {
        if !(350_000..=50_000_000).contains(&rate) {
            return Err("Invalid encoder bitrate".into());
        }
        if self.applied_rate == Some(rate) {
            return Ok(());
        }
        unsafe {
            #[cfg(windows)]
            if self.function::<unsafe extern "C" fn(Handle, i32) -> i32>(b"mew_gpu_bitrate\0")?(
                self.handle,
                rate,
            ) != 0
            {
                return Err("Encoder bitrate change failed".into());
            }
            #[cfg(not(windows))]
            self.function::<unsafe extern "C" fn(Handle, i32)>(b"mew_gpu_bitrate\0")?(
                self.handle,
                rate,
            );
        }
        self.applied_rate = Some(rate);
        Ok(())
    }
    pub fn stop(&mut self) -> Result<(), String> {
        if !self.active {
            return Ok(());
        }
        unsafe {
            #[cfg(windows)]
            {
                self.function::<Unary>(b"mew_gpu_stop\0")?(self.handle);
                self.precise_timer = power(false, self.precise_timer);
            }
            #[cfg(not(windows))]
            if self.function::<unsafe extern "C" fn(Handle) -> i32>(b"mew_gpu_stop\0")?(self.handle)
                != 0
            {
                return Err("Native capture stop was not confirmed".into());
            }
        }
        self.active = false;
        self.applied_rate = None;
        Ok(())
    }
}
impl Drop for Gpu {
    fn drop(&mut self) {
        let _ = self.stop();
        unsafe {
            (self.destroy)(self.handle);
        }
    }
}

#[cfg(windows)]
unsafe fn power(active: bool, precise: bool) -> bool {
    #[link(name = "kernel32")]
    extern "system" {
        fn SetThreadExecutionState(flags: u32) -> u32;
    }
    #[link(name = "winmm")]
    extern "system" {
        fn timeBeginPeriod(period: u32) -> u32;
        fn timeEndPeriod(period: u32) -> u32;
    }
    if active {
        let precise = timeBeginPeriod(1) == 0;
        SetThreadExecutionState(0x80000003);
        precise
    } else {
        if precise {
            timeEndPeriod(1);
        }
        SetThreadExecutionState(0x80000000);
        false
    }
}
