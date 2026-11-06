#pragma once
#include <array>
#include <cstdint>

struct MewDisplayMode { uint32_t width, height, fps; };
inline constexpr std::array<MewDisplayMode,12> mewDisplayModes{{
    {1920,1080,60},{1920,1080,120},{1920,1080,144},{1920,1080,240},
    {2560,1440,60},{2560,1440,120},{2560,1440,144},{2560,1440,240},
    {3840,2160,60},{3840,2160,120},{3840,2160,144},{3840,2160,240}
}};

// The desktop stays within the requested bounds where an advertised mode fits.
// Smaller streams still scale the minimum 1080p desktop; display Hz never needs
// to fall below 60 just because the stream sends fewer frames.
inline constexpr MewDisplayMode selectMewDisplayMode(uint32_t width,uint32_t height,uint32_t fps) {
    MewDisplayMode selected=mewDisplayModes[0];
    for(const auto& mode:mewDisplayModes) {
        if(mode.width<=width && mode.height<=height && mode.width>=selected.width) {
            selected.width=mode.width;selected.height=mode.height;
        }
    }
    for(const auto& mode:mewDisplayModes)
        if(mode.fps<=fps && mode.fps>=selected.fps)selected.fps=mode.fps;
    return selected;
}
inline constexpr bool isMewDisplayMode(MewDisplayMode mode) {
    for(const auto& candidate:mewDisplayModes)
        if(candidate.width==mode.width && candidate.height==mode.height && candidate.fps==mode.fps)return true;
    return false;
}
struct MewDisplayTiming { uint32_t width, height; uint64_t pixelRate; };
inline constexpr MewDisplayTiming mewDisplayTiming(MewDisplayMode mode) {
    uint32_t width=mode.width==1920?2200:mode.width==2560?2720:4400;
    uint32_t height=mode.height==1080?1125:mode.height==1440?1481:2250;
    return {width,height,static_cast<uint64_t>(width)*height*mode.fps};
}
