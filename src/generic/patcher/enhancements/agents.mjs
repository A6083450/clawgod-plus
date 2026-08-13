const agentTeamsPatch = {
  order: 5,
  name: 'Agent Teams always enabled',
  pattern: /function ([\w$]+)\(\)\{if\(![\w$]+\(process\.env\.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\)&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}|function ([\w$]+)\(\)\{if\(![\w$]+\.[\w$]+&&![\w$]+\(\)\)return!1;if\(![\w$]+\("tengu_amber_flint",!0\)\)return!1;return!0\}/g,
  replacer: (match, firstFn, secondFn) => `function ${firstFn || secondFn}(){return!0}`,
  sentinel: 'tengu_amber_flint',
};

const sessionMetadataPatch = {
  order: 6,
  name: 'Agents view session metadata',
  pattern: /function ([\w$]+)\(([\w$]+)\)\{for\(let ([\w$]+)=0;\3<\2\.length;\3\+\+\)\{let ([\w$]+)=\2\[\3\];if\((\4==="--debug"\|\|\4==="-d"\|\|\4==="--debug-to-stderr"\|\|\4==="-d2e"\|\|\4\.startsWith\("--debug="\)\|\|\4\.startsWith\("--debug-file="\))\)continue;if\(\4==="--debug-file"&&\3\+1<\2\.length\)\{\3\+\+;continue\}return!1\}return!0\}/g,
  replacer: (match, fn, args, index, argument, debugFlags) =>
    `function ${fn}(${args}){for(let ${index}=0;${index}<${args}.length;${index}++){let ${argument}=${args}[${index}];if(${debugFlags})continue;if(${argument}==="--debug-file"&&${index}+1<${args}.length){${index}++;continue}if(${argument}==="--session-id"/*__clawgod_agents_session_id__*/&&${index}+1<${args}.length){${index}++;continue}return!1}return!0}`,
  appliedMarker: '/*__clawgod_agents_session_id__*/',
  unique: true,
};

const defaultAgentsViewPatch = {
  order: 7,
  name: 'Default Agents view with auto Chrome',
  pattern: /,([\w$]+)=([\w$]+)\.hasAgentsPositional&&([\w$]+)\(([\w$]+)\);if\(\(\1\|\|\3\(([\w$]+)\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)\{/g,
  replacer: (match, explicit, parsed, validator, rest) =>
    `,${explicit}=${parsed}.hasAgentsPositional&&${validator}(${rest});if((${explicit}||${validator}(${parsed}.rest/*__clawgod_default_agents_view__*/)&&process.stdin.isTTY)&&process.stdout.isTTY){`,
  appliedMarker: '/*__clawgod_default_agents_view__*/',
  knownShape: /hasAgentsPositional&&[\w$]+\([\w$]+\);if\(\([\w$]+\|\|[\w$]+\([\w$]+\)&&process\.stdin\.isTTY\)&&process\.stdout\.isTTY\)/,
  unique: true,
};

const terminalHeightPatch = {
  order: 8,
  name: 'Chat Agent list fits terminal height',
  pattern: /\{columns:([\w$]+)\}=([\w$]+)\(\)([\s\S]{0,8000}?)\{windowStart:([\w$]+),windowEnd:([\w$]+),moreAbove:([\w$]+),moreBelow:([\w$]+)\}=([\w$]+)\(([\w$]+),([\w$]+)\.length,([\w$]+)\)/g,
  replacer: (match, columns, dimensions, middle, windowStart, windowEnd, moreAbove, moreBelow, windowFn, selected, tasks, limit) =>
    `{columns:${columns},rows:__clawgodTerminalRows}=${dimensions}(),__clawgodMaxChatAgentRows=Math.max(1,Math.min(${limit},__clawgodTerminalRows-6))${middle}{windowStart:${windowStart},windowEnd:${windowEnd},moreAbove:${moreAbove},moreBelow:${moreBelow}}=${windowFn}(${selected},${tasks}.length,__clawgodMaxChatAgentRows/*__clawgod_chat_agent_rows__*/)`,
  appliedMarker: '/*__clawgod_chat_agent_rows__*/',
  validate: (match, code) => code.substring(Math.max(0, code.indexOf(match) - 300), code.indexOf(match)).includes('showWorkflows'),
  optional: true,
  unique: true,
};

const overflowPatch = {
  order: 9,
  name: 'Chat Agent list keeps overflow indicator',
  pattern: /([\w$]+)\.length>([\w$]+)&&([\w$]+)\.jsx\(([\w$]+),\{justifyContent:"flex-end",children:/g,
  replacer: (match, tasks, limit, react, box) =>
    `${tasks}.length>__clawgodMaxChatAgentRows/*__clawgod_chat_agent_more__*/&&${react}.jsx(${box},{justifyContent:"flex-end",children:`,
  appliedMarker: '/*__clawgod_chat_agent_more__*/',
  validate: (match, code) => {
    const marker = code.indexOf('/*__clawgod_chat_agent_rows__*/');
    const position = code.indexOf(match);
    return marker >= 0 && position > marker && position - marker < 4000;
  },
  optional: true,
  unique: true,
};

const collapsedStatePatch = {
  order: 10,
  name: 'Agents directories default collapsed state',
  pattern: /,\[([\w$]+),([\w$]+)\]=([\w$]+)\.useState\(\(\)=>\{let [\w$]+=[\w$]+;return new Set\([\s\S]{0,500}?\)\}\),([\w$]+)=\3\.useRef\(\1\);\4\.current=\1;let\[[\w$]+,[\w$]+\]=\3\.useState\(\(\)=>new Set\)/g,
  replacer: (match, collapsed, setCollapsed, react, collapsedRef) => {
    const anchor = `${collapsedRef}=${react}.useRef(${collapsed});${collapsedRef}.current=${collapsed};`;
    return match.replace(anchor, `${anchor}let __clawgodShouldDefaultCollapseDirectories=${react}.useRef(${collapsed}.size===0),__clawgodCollapsedDirectoryKeys=${react}.useRef(new Set),__clawgodSetCollapsedGroups=${setCollapsed},__clawgodReact=${react};/*__clawgod_collapsed_directory_state__*/`);
  },
  appliedMarker: '/*__clawgod_collapsed_directory_state__*/',
  optional: true,
  unique: true,
};

const collapsedRowsPatch = {
  order: 11,
  name: 'Agents directories default collapsed rows',
  pattern: /if\(([\w$]+)\.size>0\)([\w$]+)=\2\.filter\(\(([\w$]+)\)=>\3\.kind==="header"\|\|!\1\.has\(([\w$]+)\(\3\.group\)\)\);function /g,
  replacer: (match, collapsed, rows, row, groupKey) =>
    `__clawgodReact.useLayoutEffect(()=>{let keys=[];if(__clawgodShouldDefaultCollapseDirectories.current)for(let row of ${rows})if(row.kind==="header"){let key=${groupKey}(row.group);if(key.startsWith("directory:")&&!__clawgodCollapsedDirectoryKeys.current.has(key))__clawgodCollapsedDirectoryKeys.current.add(key),keys.push(key)}__clawgodSetCollapsedGroups((current)=>{let next=new Set(current),changed=!1,marker="group:__clawgod_expanded_directories__";if(!next.has(marker))next.add(marker),changed=!0;for(let key of keys)if(!next.has(key))next.add(key),changed=!0;return changed?next:current})},[${rows}]);${match.replace(`${collapsed}.size>0`, `${collapsed}.size/*__clawgod_default_collapsed_directories__*/>0`)}`,
  appliedMarker: '/*__clawgod_default_collapsed_directories__*/',
  validate: (match, code) => code.includes('/*__clawgod_collapsed_directory_state__*/'),
  optional: true,
  unique: true,
};

const independentPatches = [
  agentTeamsPatch,
  sessionMetadataPatch,
  terminalHeightPatch,
  overflowPatch,
  collapsedStatePatch,
  collapsedRowsPatch,
];

export function createAgentsRegistry({ chromeEnabled }) {
  const patches = chromeEnabled
    ? [...independentPatches, defaultAgentsViewPatch].sort((left, right) => left.order - right.order)
    : [...independentPatches];
  return Object.freeze({
    id: 'agents',
    patches: Object.freeze(patches),
    customPatches: Object.freeze([]),
  });
}
