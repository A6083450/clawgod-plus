// @bun @bytecode
// Claude Code is a Beta product per Anthropic's Commercial Terms of Service.
// By using Claude Code, you agree that all code acceptance or rejection decisions you make,
// and the associated conversations in context, constitute Feedback under Anthropic's Commercial Terms,
// and may be used to improve Anthropic's products, including training models.
// You are responsible for reviewing any code suggestions before use.

// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.296
var L0e=Object.freeze([[1564,1564],[8234,8238],[8294,8297]]),Epr=L0e.map(([e,n])=>`\\u{${e.toString(16)}}`+(n>e?`-\\u{${n.toString(16)}}`:"")).join(""),rot=new RegExp(`[${Epr}]`,"gu");var nAt=16384;function eOn(e,n){if(typeof Bun>"u"||typeof Bun.ant?.CellSegmenter!=="function")throw Error("This runtime has no Bun.ant.CellSegmenter. Run Claude Code on the @anthropic-ai/bun-internal version pinned in package.json.");return new Bun.ant.CellSegmenter({ambiguousIsNarrow:!0,substitute:e,screen:n})}
export{L0e,Epr,rot,nAt,eOn};
