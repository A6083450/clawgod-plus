// @bun @bytecode
// Claude Code is a Beta product per Anthropic's Commercial Terms of Service.
// By using Claude Code, you agree that all code acceptance or rejection decisions you make,
// and the associated conversations in context, constitute Feedback under Anthropic's Commercial Terms,
// and may be used to improve Anthropic's products, including training models.
// You are responsible for reviewing any code suggestions before use.

// (c) Anthropic PBC. All rights reserved. Use is subject to the Legal Agreements outlined here: https://code.claude.com/docs/en/legal-and-compliance.

// Version: 2.1.293
var uHe=Object.freeze([[1564,1564],[8234,8238],[8294,8297]]),gar=uHe.map(([e,n])=>`\\u{${e.toString(16)}}`+(n>e?`-\\u{${n.toString(16)}}`:"")).join(""),stt=new RegExp(`[${gar}]`,"gu");var SEt=16384;function WAn(e,n){if(typeof Bun>"u"||typeof Bun.ant?.CellSegmenter!=="function")throw Error("This runtime has no Bun.ant.CellSegmenter. Run Claude Code on the @anthropic-ai/bun-internal version pinned in package.json.");return new Bun.ant.CellSegmenter({ambiguousIsNarrow:!0,substitute:e,screen:n})}
export{uHe,gar,stt,SEt,WAn};
