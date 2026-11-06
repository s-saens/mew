#pragma once
#include <algorithm>
#include <cstdint>

enum class MewGpuEventKind { Other, Input, Output };
struct MewGpuEvent { MewGpuEventKind kind; int32_t status; };

// One ABI read returns at most one access unit, but must also refill the encoder.
// Keep output credits whose access units cannot fit in that same ABI read.
struct MewGpuPipeline {
    int inputs=0, outputs=0, inFlight=0;
    template<class Next, class Output, class Input>
    int32_t poll(Next next, Output output, Input input) {
        for(int i=0;i<16;i++) {
            auto event=next();if(!event)break;
            if(event->status<0)return event->status;
            if(event->kind==MewGpuEventKind::Input)inputs=std::min(16,inputs+1);
            if(event->kind==MewGpuEventKind::Output)outputs++;
        }
        int32_t result=1;
        if(outputs) {
            outputs--;
            result=output();if(result<0)return result;
            if(result==0)inFlight=std::max(0,inFlight-1);
        }
        if(inputs && inFlight<3) {
            const int32_t submitted=input();if(submitted<0)return submitted;
            if(submitted==0){inputs--;inFlight++;}
        }
        return result;
    }
};
