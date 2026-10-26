fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        // CMake target dependencies do not propagate through a static archive.
        for library in [
            "crypt32", "user32", "advapi32", "ws2_32", "iphlpapi", "bcrypt",
        ] {
            println!("cargo:rustc-link-lib={library}");
        }
    }
}
