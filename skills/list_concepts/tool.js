// list_concepts — enumerate this origin's published knowledge concepts.
// The list is embedded at build time (content-addressed via tool_sha256).
var CONCEPTS = [{"id":"ccdd_CHANGELOG.md","type":"Documentation","title":"CCDD — Changelog","description":""},{"id":"ccdd_FINDINGS.md","type":"Documentation","title":"CCDD — Hallazgos y lecciones de diseño","description":""},{"id":"ccdd_PITCH.md","type":"Documentation","title":"CCDD — Guion de pitch deck","description":""},{"id":"ccdd_PROPOSAL.md","type":"Documentation","title":"Propuesta: CCDD — Context Contract-Driven Development","description":""},{"id":"ccdd_spec_v0.3.md","type":"Documentation","title":"CCDD — Especificación v0.3","description":""},{"id":"ccdd_workflow.md","type":"Documentation","title":"Context Contract-Driven Development (CCDD)","description":""}];
registerTool({
  name: "list_concepts",
  description: "List all knowledge concepts published by this origin (id, type, title, description).",
  inputSchema: { type: "object", properties: {} },
  handler: function () { return { concepts: CONCEPTS }; }
});
