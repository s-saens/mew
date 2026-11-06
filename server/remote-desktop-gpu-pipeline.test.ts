import test from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const run = promisify(execFile)

test('GPU output and new input share one turn without losing output credits or exceeding surface capacity', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mew-gpu-pipeline-'))
  try {
    await fs.copyFile(path.resolve(import.meta.dirname, '../native/remote-desktop/gpu-pipeline.h'), path.join(root, 'gpu-pipeline.h'))
    await fs.writeFile(path.join(root, 'pipeline.cpp'), `#include "gpu-pipeline.h"
#include <cassert>
#include <deque>
#include <optional>
int main(){
 MewGpuPipeline pipeline;
 std::deque<MewGpuEvent> events;
 int submitted=0,delivered=0;
 bool hasFrame=true,accepting=true;
 auto next=[&]()->std::optional<MewGpuEvent>{
  if(events.empty())return std::nullopt;
  auto event=events.front();events.pop_front();return event;
 };
 auto output=[&](){delivered++;return 0;};
 auto input=[&](){if(!hasFrame || !accepting)return 1;submitted++;return 0;};
 auto poll=[&](){return pipeline.poll(next,output,input);};
 for(int i=0;i<4;i++)events.push_back({MewGpuEventKind::Input,0});
 assert(poll()==1 && submitted==1);
 assert(poll()==1 && submitted==2);
 assert(poll()==1 && submitted==3);
 assert(poll()==1 && submitted==3 && pipeline.inputs==1);
 events.push_back({MewGpuEventKind::Output,0});
 assert(poll()==0 && delivered==1 && submitted==4 && pipeline.inFlight==3);
 // Multiple output notifications must not overwrite the ABI's single buffer.
 events.push_back({MewGpuEventKind::Output,0});events.push_back({MewGpuEventKind::Output,0});
 hasFrame=false;events.push_back({MewGpuEventKind::Input,0});
 assert(poll()==0 && delivered==2 && pipeline.outputs==1);
 assert(poll()==0 && delivered==3 && pipeline.outputs==0);
 assert(poll()==1 && delivered==3 && pipeline.inputs==1);
 // A temporary ProcessInput rejection retains the input event for retry.
 hasFrame=true;accepting=false;assert(poll()==1 && submitted==4 && pipeline.inputs==1);
 accepting=true;assert(poll()==1 && submitted==5 && pipeline.inputs==0);
 events.push_back({MewGpuEventKind::Other,-9});assert(poll()==-9 && submitted==5);
 pipeline={};events.push_back({MewGpuEventKind::Input,0});events.push_back({MewGpuEventKind::Output,0});
 assert(pipeline.poll(next,[](){return -10;},input)==-10 && submitted==5);
 pipeline={};events.push_back({MewGpuEventKind::Input,0});events.push_back({MewGpuEventKind::Output,0});
 assert(pipeline.poll(next,output,[](){return -11;})==-11);
 // A bounded event drain retains later notifications for the next turn.
 pipeline={};events.clear();for(int i=0;i<18;i++)events.push_back({MewGpuEventKind::Input,0});
 assert(poll()==1 && events.size()==2 && pipeline.inputs==15);
 assert(poll()==1 && events.empty() && pipeline.inputs==15);
}
`)
    await run('c++', ['-std=c++17', '-Wall', '-Wextra', '-Werror', path.join(root, 'pipeline.cpp'), '-o', path.join(root, 'pipeline')])
    await run(path.join(root, 'pipeline'))
  } finally { await fs.rm(root, { recursive: true, force: true }) }
})
