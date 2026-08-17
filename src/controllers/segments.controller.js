const segmentService = require('../services/segment.service');

/** POST /api/v1/segments/preview — dry-run a filter without saving it */
async function preview(req, res) {
  const rows = await segmentService.previewSegment(req.body.filter || {});
  res.json({ count: rows.length, sample: rows.slice(0, 20) });
}

/** POST /api/v1/segments — save a segment definition */
async function create(req, res) {
  const { name, description, filter } = req.body;
  if (!name || !filter) return res.status(400).json({ error: 'missing_fields' });
  const id = await segmentService.createSegment({ name, description, filter });
  res.status(201).json({ id });
}

/** GET /api/v1/segments — list saved segments */
async function list(req, res) {
  const rows = await segmentService.listSegments();
  res.json(rows);
}

/** GET /api/v1/segments/:id/members — live re-evaluated member list */
async function members(req, res) {
  const segment = await segmentService.getSegment(req.params.id);
  if (!segment) return res.status(404).json({ error: 'not_found' });
  const filter = typeof segment.filter_json === 'string' ? JSON.parse(segment.filter_json) : segment.filter_json;
  const rows = await segmentService.previewSegment(filter);
  res.json({ segment: { id: segment.id, name: segment.name }, count: rows.length, members: rows });
}

/** DELETE /api/v1/segments/:id */
async function remove(req, res) {
  await segmentService.deleteSegment(req.params.id);
  res.status(204).send();
}

module.exports = { preview, create, list, members, remove };
