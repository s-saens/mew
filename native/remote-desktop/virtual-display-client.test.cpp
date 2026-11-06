// Runs against the Windows SDK with only CCD calls mocked. No display settings
// or devices are changed by this executable.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <setupapi.h>
#include <vector>
#include <algorithm>
#include <cassert>
#include <cstring>
#include <cwchar>

static std::vector<DISPLAYCONFIG_PATH_INFO> inputPaths;
static std::vector<DISPLAYCONFIG_MODE_INFO> inputModes;
struct AppliedConfig {
    UINT32 flags;
    std::vector<DISPLAYCONFIG_PATH_INFO> paths;
    std::vector<DISPLAYCONFIG_MODE_INFO> modes;
};
static std::vector<AppliedConfig> configs;
static LONG validationResult=ERROR_SUCCESS;
static LONG mockSizes(UINT32,UINT32* paths,UINT32* modes) {
    *paths=static_cast<UINT32>(inputPaths.size());*modes=static_cast<UINT32>(inputModes.size());return ERROR_SUCCESS;
}
static LONG mockQuery(UINT32,UINT32* paths,DISPLAYCONFIG_PATH_INFO* values,UINT32* modes,DISPLAYCONFIG_MODE_INFO* info,DISPLAYCONFIG_TOPOLOGY_ID*) {
    assert(*paths>=inputPaths.size() && *modes>=inputModes.size());
    std::copy(inputPaths.begin(),inputPaths.end(),values);std::copy(inputModes.begin(),inputModes.end(),info);
    *paths=static_cast<UINT32>(inputPaths.size());*modes=static_cast<UINT32>(inputModes.size());return ERROR_SUCCESS;
}
static LONG mockDeviceInfo(DISPLAYCONFIG_DEVICE_INFO_HEADER* header) {
    assert(header->type==DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME);
    auto name=reinterpret_cast<DISPLAYCONFIG_TARGET_DEVICE_NAME*>(header);
    wcscpy_s(name->monitorDevicePath,header->id==40?L"\\\\?\\DISPLAY#MEW0001#0":L"\\\\?\\DISPLAY#PHYSICAL#0");return ERROR_SUCCESS;
}
static LONG mockSet(UINT32 count,DISPLAYCONFIG_PATH_INFO* paths,UINT32 modes,DISPLAYCONFIG_MODE_INFO* info,UINT32 flags) {
    assert(!(flags&SDC_ALLOW_CHANGES));assert(!(flags&SDC_SAVE_TO_DATABASE));
    configs.push_back({flags,{paths,paths+count},{info,info+modes}});
    return flags&SDC_VALIDATE?validationResult:ERROR_SUCCESS;
}
#define GetDisplayConfigBufferSizes mockSizes
#define QueryDisplayConfig mockQuery
#define DisplayConfigGetDeviceInfo mockDeviceInfo
#define SetDisplayConfig mockSet
#include "virtual-display-client.h"

static void fixture(bool active) {
    configs.clear();inputModes.clear();inputPaths.clear();validationResult=ERROR_SUCCESS;
    DISPLAYCONFIG_MODE_INFO physicalSource{};physicalSource.infoType=DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE;
    physicalSource.adapterId={1,0};physicalSource.id=10;
    physicalSource.sourceMode.width=1920;physicalSource.sourceMode.height=1080;
    physicalSource.sourceMode.pixelFormat=DISPLAYCONFIG_PIXELFORMAT_32BPP;
    DISPLAYCONFIG_MODE_INFO physicalTarget{};physicalTarget.infoType=DISPLAYCONFIG_MODE_INFO_TYPE_TARGET;
    physicalTarget.adapterId={1,0};physicalTarget.id=20;mewDisplaySignal(physicalTarget.targetMode.targetVideoSignalInfo,{1920,1080,60},false);
    inputModes={physicalSource,physicalTarget};
    DISPLAYCONFIG_PATH_INFO physical{};physical.flags=DISPLAYCONFIG_PATH_ACTIVE;
    physical.sourceInfo.adapterId={1,0};physical.sourceInfo.id=10;physical.sourceInfo.modeInfoIdx=0;
    physical.targetInfo.adapterId={1,0};physical.targetInfo.id=20;physical.targetInfo.modeInfoIdx=1;
    physical.targetInfo.refreshRate={60,1};
    DISPLAYCONFIG_PATH_INFO own{};own.sourceInfo.adapterId={2,0};own.sourceInfo.id=30;
    own.targetInfo.adapterId={2,0};own.targetInfo.id=40;
    own.sourceInfo.modeInfoIdx=own.targetInfo.modeInfoIdx=DISPLAYCONFIG_PATH_MODE_IDX_INVALID;
    if(active) {
        own.flags=DISPLAYCONFIG_PATH_ACTIVE;own.sourceInfo.modeInfoIdx=2;own.targetInfo.modeInfoIdx=3;own.targetInfo.refreshRate={60,1};
        auto source=physicalSource;source.adapterId={2,0};source.id=30;source.sourceMode.position.x=1920;
        auto target=physicalTarget;target.adapterId={2,0};target.id=40;inputModes.push_back(source);inputModes.push_back(target);
    }
    inputPaths={physical,own};
}
static void preservesPhysical(const AppliedConfig& config) {
    assert(config.paths.size()==2);
    assert(!memcmp(&config.paths[0],&inputPaths[0],sizeof(DISPLAYCONFIG_PATH_INFO)));
    assert(!memcmp(&config.modes[0],&inputModes[0],sizeof(DISPLAYCONFIG_MODE_INFO)));
    assert(!memcmp(&config.modes[1],&inputModes[1],sizeof(DISPLAYCONFIG_MODE_INFO)));
}
int main() {
    fixture(false);assert(activateMewDisplay(2560,1440,144)==ERROR_SUCCESS);assert(configs.size()==2);
    for(const auto& config:configs) {
        preservesPhysical(config);const auto& own=config.paths[1];
        const auto& source=config.modes[own.sourceInfo.modeInfoIdx].sourceMode;
        const auto& signal=config.modes[own.targetInfo.modeInfoIdx].targetMode.targetVideoSignalInfo;
        assert(source.width==2560 && source.height==1440 && source.position.x==1920 && source.position.y==0);
        assert(signal.activeSize.cx==2560 && signal.activeSize.cy==1440 && signal.vSyncFreq.Numerator==144);
        assert(own.targetInfo.refreshRate.Numerator==144);
    }
    assert(configs[0].flags==(SDC_USE_SUPPLIED_DISPLAY_CONFIG|SDC_VALIDATE));
    assert(configs[1].flags==(SDC_USE_SUPPLIED_DISPLAY_CONFIG|SDC_APPLY));

    fixture(true);assert(activateMewDisplay(3840,2160,240)==ERROR_SUCCESS);assert(configs.size()==2);
    preservesPhysical(configs.back());assert(configs.back().modes.size()==4);
    assert(configs.back().modes[2].sourceMode.width==3840 && configs.back().modes[2].sourceMode.position.x==1920);
    assert(configs.back().modes[3].targetMode.targetVideoSignalInfo.vSyncFreq.Numerator==240);

    fixture(true);assert(activateMewDisplay(1920,1080,60)==ERROR_SUCCESS);assert(configs.empty());
    fixture(false);validationResult=ERROR_BAD_CONFIGURATION;
    assert(activateMewDisplay(2560,1440,120)==ERROR_BAD_CONFIGURATION);assert(configs.size()==1);

    fixture(false);inputPaths[1].sourceInfo=inputPaths[0].sourceInfo;
    assert(activateMewDisplay(2560,1440,120)==ERROR_NOT_FOUND);assert(configs.empty());
    fixture(true);inputPaths[1].sourceInfo=inputPaths[0].sourceInfo;
    assert(activateMewDisplay(2560,1440,120)==ERROR_INVALID_DATA);assert(configs.empty());
    fixture(false);assert(activateMewDisplay(0,1440,120)==ERROR_INVALID_PARAMETER);assert(configs.empty());
    fixture(false);inputPaths.erase(inputPaths.begin());inputModes.clear();
    assert(activateMewDisplay(1920,1080,120)==ERROR_SUCCESS);
    assert(configs.back().modes[0].sourceMode.position.x==0);
}
