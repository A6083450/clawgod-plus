// Version: 2.1.332
// 官方本地 human 输入检查原字节切片。
function ua(e){return e?.kind==="human"}
var r=new WeakSet;
function kzi(){let e=Object.freeze({});return r.add(e),e}
function tb(e){return typeof e==="object"&&e!==null&&r.has(e)}
function SY(e){return e.dispatchedOverBridge===!0||e.submissionVerifiedSlackHumanTurn===!0}
function iQe(e){return ua(e.submissionOrigin)&&!SY(e)&&(e.promptSource==="typed"||e.promptSource==="queued")}
function aQe(e){return e.isMidTurn===!0&&e.promptSource===void 0?ua(e.submissionOrigin)&&!SY(e):iQe(e)&&tb(e.submittedFromComposer)}
function wve(e){return e.submittedOnLocalStdin===!0&&!SY(e)}
function Bmn(e){return wve(e)&&ua(e.submissionOrigin)}
