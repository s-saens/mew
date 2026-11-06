#pragma once
#include <setupapi.h>
#include <vector>
#include <string>
#include <algorithm>
#include <cwctype>
#include <limits>
#include "virtual-display-protocol.h"

static HANDLE openMewDisplay() {
    HDEVINFO devices=SetupDiGetClassDevsW(&mewDisplayInterface,nullptr,nullptr,DIGCF_PRESENT|DIGCF_DEVICEINTERFACE);
    if(devices==INVALID_HANDLE_VALUE)return INVALID_HANDLE_VALUE;
    HANDLE result=INVALID_HANDLE_VALUE;
    SP_DEVICE_INTERFACE_DATA entry{};entry.cbSize=sizeof(entry);
    if(SetupDiEnumDeviceInterfaces(devices,nullptr,&mewDisplayInterface,0,&entry)) {
        DWORD bytes=0;SetupDiGetDeviceInterfaceDetailW(devices,&entry,nullptr,0,&bytes,nullptr);
        if(bytes>=sizeof(SP_DEVICE_INTERFACE_DETAIL_DATA_W) && bytes<=64*1024) {
            std::vector<BYTE> storage(bytes);
            auto detail=reinterpret_cast<SP_DEVICE_INTERFACE_DETAIL_DATA_W*>(storage.data());detail->cbSize=sizeof(*detail);
            if(SetupDiGetDeviceInterfaceDetailW(devices,&entry,detail,bytes,nullptr,nullptr))
                result=CreateFileW(detail->DevicePath,GENERIC_READ|GENERIC_WRITE,FILE_SHARE_READ|FILE_SHARE_WRITE,nullptr,OPEN_EXISTING,0,nullptr);
        }
    }
    SetupDiDestroyDeviceInfoList(devices);return result;
}
static bool mewTarget(const DISPLAYCONFIG_PATH_INFO& path) {
    DISPLAYCONFIG_TARGET_DEVICE_NAME name{};name.header.size=sizeof(name);name.header.type=DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME;
    name.header.adapterId=path.targetInfo.adapterId;name.header.id=path.targetInfo.id;
    if(DisplayConfigGetDeviceInfo(&name.header)!=ERROR_SUCCESS)return false;
    std::wstring value=name.monitorDevicePath;
    std::transform(value.begin(),value.end(),value.begin(),towupper);
    return value.find(L"MEW0001")!=std::wstring::npos;
}
static LONG mewDisplayPaths(UINT flags,std::vector<DISPLAYCONFIG_PATH_INFO>& paths,std::vector<DISPLAYCONFIG_MODE_INFO>& modes) {
    for(int attempt=0;attempt<4;attempt++) {
        UINT32 count=0,modeCount=0;LONG status=GetDisplayConfigBufferSizes(flags,&count,&modeCount);
        if(status!=ERROR_SUCCESS)return status;
        if(count>4096 || modeCount>16384)return ERROR_INVALID_DATA;
        paths.resize(std::max<UINT32>(1,count));modes.resize(std::max<UINT32>(1,modeCount));
        status=QueryDisplayConfig(flags,&count,paths.data(),&modeCount,modes.data(),nullptr);
        if(status==ERROR_INSUFFICIENT_BUFFER)continue;
        if(status==ERROR_SUCCESS){paths.resize(count);modes.resize(modeCount);}return status;
    }
    return ERROR_INSUFFICIENT_BUFFER;
}
static bool mewSameAdapter(LUID left,LUID right) {
    return left.LowPart==right.LowPart && left.HighPart==right.HighPart;
}
static bool mewSameSource(const DISPLAYCONFIG_PATH_INFO& left,const DISPLAYCONFIG_PATH_INFO& right) {
    return left.sourceInfo.id==right.sourceInfo.id && mewSameAdapter(left.sourceInfo.adapterId,right.sourceInfo.adapterId);
}
// Supply exact timings for our output and keep every existing output unchanged.
// Allowing Windows to choose other modes here can silently lower the requested
// refresh rate or change a physical display, so validation and apply are strict.
static LONG activateMewDisplay(uint32_t width,uint32_t height,uint32_t fps) {
    if(!width || !height || !fps)return ERROR_INVALID_PARAMETER;
    auto selected=selectMewDisplayMode(width,height,fps);
    std::vector<DISPLAYCONFIG_PATH_INFO> paths;std::vector<DISPLAYCONFIG_MODE_INFO> modes;
    LONG status=mewDisplayPaths(QDC_ALL_PATHS,paths,modes);if(status!=ERROR_SUCCESS)return status;
    std::vector<DISPLAYCONFIG_PATH_INFO> active;
    DISPLAYCONFIG_PATH_INFO added{};bool found=false;size_t ownIndex=0;
    for(const auto& path:paths) {
        if(path.flags&DISPLAYCONFIG_PATH_ACTIVE)active.push_back(path);
        if((path.flags&DISPLAYCONFIG_PATH_ACTIVE) && mewTarget(path)) {
            added=path;found=true;ownIndex=active.size()-1;
        }
    }
    if(!found)for(const auto& path:paths) {
        if(!mewTarget(path))continue;
        bool shared=false;for(const auto& existing:active)if(mewSameSource(path,existing)){shared=true;break;}
        if(!shared){added=path;found=true;ownIndex=active.size();break;}
    }
    if(!found)return ERROR_NOT_FOUND;
    for(size_t index=0;index<active.size();++index)
        if(index!=ownIndex && mewSameSource(added,active[index]))return ERROR_INVALID_DATA;
    if(ownIndex<active.size()) {
        auto s=added.sourceInfo.modeInfoIdx,t=added.targetInfo.modeInfoIdx;
        if(s<modes.size() && t<modes.size() && modes[s].infoType==DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE && modes[t].infoType==DISPLAYCONFIG_MODE_INFO_TYPE_TARGET) {
            const auto& source=modes[s].sourceMode;const auto& signal=modes[t].targetMode.targetVideoSignalInfo;
            if(source.width==selected.width && source.height==selected.height &&
                signal.activeSize.cx==selected.width && signal.activeSize.cy==selected.height &&
                signal.vSyncFreq.Denominator && static_cast<uint64_t>(signal.vSyncFreq.Numerator)==static_cast<uint64_t>(selected.fps)*signal.vSyncFreq.Denominator)return ERROR_SUCCESS;
        }
    }

    POINTL position{};int64_t right=0;
    for(size_t index=0;index<active.size();++index) {
        auto source=active[index].sourceInfo.modeInfoIdx;
        if(source>=modes.size() || modes[source].infoType!=DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE)return ERROR_INVALID_DATA;
        const auto& existing=modes[source].sourceMode;
        if(index==ownIndex)position=existing.position;
        else right=std::max<int64_t>(right,static_cast<int64_t>(existing.position.x)+existing.width);
    }
    if(ownIndex==active.size()) {
        if(right>std::numeric_limits<LONG>::max()-static_cast<int64_t>(selected.width))return ERROR_INVALID_DATA;
        position.x=static_cast<LONG>(right);
    }
    // Reuse an existing entry for the same source/target identifier. The CCD
    // mode table must contain each identifier only once, including clone paths.
    auto putMode=[&](DISPLAYCONFIG_MODE_INFO value) {
        for(UINT32 index=0;index<modes.size();++index) {
            const auto& mode=modes[index];
            if(mode.infoType==value.infoType && mode.id==value.id && mewSameAdapter(mode.adapterId,value.adapterId)) {
                modes[index]=value;return index;
            }
        }
        modes.push_back(value);return static_cast<UINT32>(modes.size()-1);
    };
    DISPLAYCONFIG_MODE_INFO source{};source.infoType=DISPLAYCONFIG_MODE_INFO_TYPE_SOURCE;
    source.id=added.sourceInfo.id;source.adapterId=added.sourceInfo.adapterId;
    source.sourceMode.width=selected.width;source.sourceMode.height=selected.height;
    source.sourceMode.pixelFormat=DISPLAYCONFIG_PIXELFORMAT_32BPP;source.sourceMode.position=position;
    DISPLAYCONFIG_MODE_INFO target{};target.infoType=DISPLAYCONFIG_MODE_INFO_TYPE_TARGET;
    target.id=added.targetInfo.id;target.adapterId=added.targetInfo.adapterId;
    mewDisplaySignal(target.targetMode.targetVideoSignalInfo,selected,false);
    auto sourceIndex=putMode(source),targetIndex=putMode(target);
    added.flags|=DISPLAYCONFIG_PATH_ACTIVE;
    added.sourceInfo.modeInfoIdx=sourceIndex;added.targetInfo.modeInfoIdx=targetIndex;
    added.targetInfo.refreshRate={selected.fps,1};added.targetInfo.rotation=DISPLAYCONFIG_ROTATION_IDENTITY;
    added.targetInfo.scaling=DISPLAYCONFIG_SCALING_IDENTITY;added.targetInfo.scanLineOrdering=DISPLAYCONFIG_SCANLINE_ORDERING_PROGRESSIVE;
    if(ownIndex==active.size())active.push_back(added);else active[ownIndex]=added;
    auto count=static_cast<UINT32>(active.size()),modeCount=static_cast<UINT32>(modes.size());
    status=SetDisplayConfig(count,active.data(),modeCount,modes.data(),SDC_USE_SUPPLIED_DISPLAY_CONFIG|SDC_VALIDATE);
    if(status!=ERROR_SUCCESS)return status;
    return SetDisplayConfig(count,active.data(),modeCount,modes.data(),SDC_USE_SUPPLIED_DISPLAY_CONFIG|SDC_APPLY);
}
static HMONITOR findMewMonitor() {
    std::vector<DISPLAYCONFIG_PATH_INFO> paths;std::vector<DISPLAYCONFIG_MODE_INFO> modes;
    if(mewDisplayPaths(QDC_ONLY_ACTIVE_PATHS,paths,modes)!=ERROR_SUCCESS)return nullptr;
    for(const auto& path:paths) {
        if(!mewTarget(path))continue;
        DISPLAYCONFIG_SOURCE_DEVICE_NAME source{};source.header.size=sizeof(source);source.header.type=DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME;
        source.header.adapterId=path.sourceInfo.adapterId;source.header.id=path.sourceInfo.id;
        if(DisplayConfigGetDeviceInfo(&source.header)!=ERROR_SUCCESS)continue;
        struct Search { const wchar_t* name;HMONITOR result; } search{source.viewGdiDeviceName,nullptr};
        EnumDisplayMonitors(nullptr,nullptr,[](HMONITOR monitor,HDC,LPRECT,LPARAM data)->BOOL {
            auto query=reinterpret_cast<Search*>(data);MONITORINFOEXW info{};info.cbSize=sizeof(info);
            if(GetMonitorInfoW(monitor,&info) && !_wcsicmp(info.szDevice,query->name)){query->result=monitor;return FALSE;}return TRUE;
        },reinterpret_cast<LPARAM>(&search));
        if(search.result)return search.result;
    }
    return nullptr;
}
