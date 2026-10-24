// Oyo MDA reference list and the MoU MDAs setting (story 11.7c).
//
// GET  /api/mdas      all roles: [{ code, name, abbreviation, mou }] in vlprs
//                     order, Other last.
// PUT  /api/mdas/mou  DG / Portal-Admin: { codes: [...] } replaces the MoU set.
// With no setting stored the MoU set is DEFAULT_MOU_MDAS.
const Setting = require('../models/Setting');
const { MDA_LIST, MDA_CODES, DEFAULT_MOU_MDAS } = require('../constants/mdas');

const MOU_KEY = 'mouMdas';

// Stored codes that are still on the list; the default when nothing is stored.
const getMouCodes = async () => {
  const setting = await Setting.findOne({ key: MOU_KEY }).lean();
  if (!setting || !Array.isArray(setting.value)) return [...DEFAULT_MOU_MDAS];
  return setting.value.filter((c) => MDA_CODES.includes(c));
};

const listWithMou = (mouCodes) => {
  const mou = new Set(mouCodes);
  return MDA_LIST.map((m) => ({
    code: m.code, name: m.name, abbreviation: m.abbreviation, mou: mou.has(m.code),
  }));
};

const getMdas = async (req, res) => {
  try {
    return res.json(listWithMou(await getMouCodes()));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

const updateMouMdas = async (req, res) => {
  try {
    const codes = req.body && req.body.codes;
    if (!Array.isArray(codes)) return res.status(400).json({ message: 'codes must be a list of MDA codes.' });
    const bad = codes.filter((c) => typeof c !== 'string' || !MDA_CODES.includes(c));
    if (bad.length) return res.status(400).json({ message: `Invalid MDA: ${bad.map((c) => JSON.stringify(c)).join(', ')}` });
    const unique = [...new Set(codes)];
    await Setting.findOneAndUpdate(
      { key: MOU_KEY },
      { $set: { value: unique, updatedBy: req.user._id } },
      { upsert: true, new: true, runValidators: true },
    );
    return res.json(listWithMou(unique));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};

module.exports = {
  getMdas, updateMouMdas, getMouCodes, MOU_KEY,
};
