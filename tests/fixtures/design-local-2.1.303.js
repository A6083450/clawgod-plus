// Claude Code 2.1.303 的 design 注册函数；保留真实结构以检测上游漂移。
const cloudDescription="Hub for Claude Design (claude.ai/design)";
function lt(e){let n=()=>Bo(e),s=()=>vs[n()??"consent"];oi({name:Nmt,description:()=>s().description(),menuDescription:()=>s().menu(),argumentHint:()=>s().hint,subcommands:at,subcommandsBareOnly:!0,isEnabled:()=>n()!==null,survivesBundledKillSwitch:!0,policyGate:()=>n()==="types"?void 0:hUe,userInvocable:!0,disableModelInvocation:!0,async getArgumentCompletions(r,l){if(r.length>0)return[];let h=l.toLowerCase();return Cs(e).filter((y)=>y.value.startsWith(h))},getPromptForCommand:(r)=>bs(r,e)})}
lt({hubMode:!0,designSync:!0});
