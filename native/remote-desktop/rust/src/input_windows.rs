use crate::{
    gpu::Screen,
    input::{Action, Adapter},
};
use serde_json::Value;
use std::{collections::HashMap, ffi::c_void};

#[repr(C)]
#[derive(Clone, Copy)]
struct Mouse {
    dx: i32,
    dy: i32,
    data: u32,
    flags: u32,
    time: u32,
    extra: usize,
}
#[repr(C)]
#[derive(Clone, Copy)]
struct Keyboard {
    key: u16,
    scan: u16,
    flags: u32,
    time: u32,
    extra: usize,
}
#[repr(C)]
union Data {
    mouse: Mouse,
    keyboard: Keyboard,
}
#[repr(C)]
struct NativeInput {
    kind: u32,
    data: Data,
}
#[repr(C)]
#[derive(Default)]
struct Point {
    x: i32,
    y: i32,
}
#[cfg_attr(windows, link(name = "user32"))]
extern "system" {
    fn SendInput(count: u32, inputs: *const NativeInput, size: i32) -> u32;
    fn MapVirtualKeyW(code: u32, kind: u32) -> u32;
    fn GetCursorPos(point: *mut Point) -> i32;
    fn SetCursorPos(x: i32, y: i32) -> i32;
    fn OpenInputDesktop(flags: u32, inherit: i32, access: u32) -> *mut c_void;
    fn GetUserObjectInformationW(
        handle: *mut c_void,
        index: i32,
        data: *mut u16,
        length: u32,
        needed: *mut u32,
    ) -> i32;
    fn CloseDesktop(handle: *mut c_void) -> i32;
}
pub struct Windows {
    bounds: Screen,
    keys: HashMap<String, u16>,
}
impl Windows {
    pub fn new(bounds: Screen, keys: &Value) -> Result<Self, String> {
        let keys: HashMap<String, u16> =
            serde_json::from_value(keys.clone()).map_err(|_| "Invalid Windows key mapping")?;
        if keys.len() > 256 || keys.values().any(|k| *k > 255) {
            return Err("Invalid Windows key mapping".into());
        }
        Ok(Self { bounds, keys })
    }
    fn send(input: NativeInput) -> Result<(), String> {
        if unsafe { SendInput(1, &input, std::mem::size_of::<NativeInput>() as i32) } == 1 {
            Ok(())
        } else {
            Err("Windows input denied; administrator and UAC windows cannot be controlled".into())
        }
    }
    fn mouse(flags: u32, data: i32) -> Result<(), String> {
        Self::send(NativeInput {
            kind: 0,
            data: Data {
                mouse: Mouse {
                    dx: 0,
                    dy: 0,
                    data: data as u32,
                    flags,
                    time: 0,
                    extra: 0,
                },
            },
        })
    }
    fn position(x: f64, y: f64) -> Result<(), String> {
        if unsafe { SetCursorPos(x.round() as i32, y.round() as i32) } != 0 {
            Ok(())
        } else {
            Err("Windows cursor movement denied".into())
        }
    }
}
impl Adapter for Windows {
    fn allowed(&self) -> bool {
        unsafe {
            let desktop = OpenInputDesktop(0, 0, 1);
            if desktop.is_null() {
                return false;
            }
            let mut buffer = [0u16; 128];
            let mut needed = 0;
            let valid = GetUserObjectInformationW(
                desktop,
                2,
                buffer.as_mut_ptr(),
                std::mem::size_of_val(&buffer) as u32,
                &mut needed,
            ) != 0;
            CloseDesktop(desktop);
            valid
                && String::from_utf16_lossy(
                    &buffer[..buffer.iter().position(|c| *c == 0).unwrap_or(buffer.len())],
                )
                .eq_ignore_ascii_case("default")
        }
    }
    fn apply(&mut self, action: &Action) -> Result<(), String> {
        match action {
            Action::Move(dx, dy) => {
                let mut point = Point::default();
                if unsafe { GetCursorPos(&mut point) } == 0 {
                    return Err("Windows cursor position unavailable".into());
                }
                Self::position(point.x as f64 + dx, point.y as f64 + dy)
            }
            Action::Point(x, y) => Self::position(
                self.bounds.x as f64 + x * (self.bounds.width - 1) as f64,
                self.bounds.y as f64 + y * (self.bounds.height - 1) as f64,
            ),
            Action::Button(bit, down) => Self::mouse(
                match (bit, down) {
                    (1, true) => 2,
                    (1, false) => 4,
                    (2, true) => 32,
                    (2, false) => 64,
                    (_, true) => 8,
                    (_, false) => 16,
                },
                0,
            ),
            Action::Wheel(x, y) => {
                if *y != 0. {
                    Self::mouse(0x800, (-y).round() as i32)?;
                }
                if *x != 0. {
                    Self::mouse(0x1000, x.round() as i32)?;
                }
                Ok(())
            }
            Action::Key(code, down) => {
                let Some(key) = self.keys.get(code) else {
                    return Ok(());
                };
                let scan = if code == "NumpadEnter" {
                    0xe01c
                } else {
                    unsafe { MapVirtualKeyW(*key as u32, 4) }
                };
                let physical = scan != 0
                    && scan >> 8 != 0xe1
                    && !["Pause", "Lang1", "Lang2"].contains(&code.as_str());
                let extended = if physical {
                    scan >> 8 == 0xe0
                } else {
                    [
                        "Arrow",
                        "Home",
                        "End",
                        "Page",
                        "Delete",
                        "Insert",
                        "Meta",
                        "ControlRight",
                        "AltRight",
                        "NumpadEnter",
                        "NumpadDivide",
                        "NumLock",
                        "PrintScreen",
                        "ContextMenu",
                        "AudioVolume",
                        "Media",
                        "Browser",
                        "Launch",
                    ]
                    .iter()
                    .any(|prefix| code.starts_with(prefix))
                };
                Self::send(NativeInput {
                    kind: 1,
                    data: Data {
                        keyboard: Keyboard {
                            key: if physical { 0 } else { *key },
                            scan: if physical { (scan & 255) as u16 } else { 0 },
                            flags: if *down { 0 } else { 2 }
                                | if physical { 8 } else { 0 }
                                | u32::from(extended),
                            time: 0,
                            extra: 0,
                        },
                    },
                })
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_input_abi_matches_windows_pointer_alignment() {
        if std::mem::size_of::<usize>() == 8 {
            assert_eq!(std::mem::size_of::<NativeInput>(), 40);
            assert_eq!(std::mem::offset_of!(NativeInput, data), 8);
            assert_eq!(std::mem::offset_of!(Keyboard, flags), 4);
            assert_eq!(std::mem::offset_of!(Mouse, flags), 12);
        }
    }
}
