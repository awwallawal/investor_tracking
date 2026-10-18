const mongoose = require('mongoose');
const Investor = require('../models/InvestorModel');
const InvestmentProject = require('../models/InvestmentProject');
const InteractionLog = require('../models/InteractionLog');
const { recordDeletionGroups, newBatchId } = require('../utils/recordDeletion');

// exports.createInvestor = async (req, res) => {
//     try {
//         const investor = new Investor(req.body);
//         await investor.save();
//         res.status(201).send(investor);
//     } catch (error) {
//         res.status(400).send(error);
//     }
// };

exports.createInvestor = async (req, res) => {
  try {
    const investor = await Investor.create(req.body);
    res.status(201).json(investor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getAllInvestors = async (req, res) => {
    try {
        const investors = await Investor.find({});
        res.send(investors);
    } catch (error) {
        res.status(500).send(error);
    }
};

exports.getInvestorById = async (req, res) => {
    try {
        const investor = await Investor.findById(req.params.id).populate('assignedTo', 'name');
        if (!investor) {
            return res.status(404).send();
        }
        res.send(investor);
    } catch (error) {
        res.status(500).send(error);
    }
};

exports.updateInvestor = async (req, res) => {
    try {
        const investor = await Investor.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!investor) {
            return res.status(404).json({ error: 'Investor not found' });
        }
        res.json(investor);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
};

// @desc    Delete an investor, its projects and every related interaction.
//          Every document is written to the ChangeLog first; if that fails,
//          nothing is deleted. No transaction (the target MongoDB may be standalone).
// @route   DELETE /api/investors/:id
// @access  Private (Director-General, Portal-Admin)
exports.deleteInvestor = async (req, res) => {
  try {
    const { id } = req.params;
    const investor = mongoose.isValidObjectId(id) && await Investor.findById(id).lean();
    if (!investor) {
      return res.status(404).json({ message: 'Investor not found.' });
    }

    const { reason } = req.body || {};
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) {
      return res.status(400).json({ message: 'A reason is required to delete an investor.' });
    }

    const projects = await InvestmentProject.find({ investor: id }).lean();
    const projectIds = projects.map((p) => p._id);
    const logs = await InteractionLog.find({
      $or: [{ investor: id }, { project: { $in: projectIds } }],
    }).lean();

    try {
      await recordDeletionGroups(req, [
        ['Investor', [investor]],
        ['InvestmentProject', projects],
        ['InteractionLog', logs],
      ], { reason: trimmed, batchId: newBatchId() });
    } catch (auditError) {
      console.error('ChangeLog write failed; investor delete aborted:', auditError);
      return res.status(500).json({ message: 'Could not write the audit record. Nothing was deleted.' });
    }

    // Delete exactly the documents that were audited.
    await InteractionLog.deleteMany({ _id: { $in: logs.map((l) => l._id) } });
    await InvestmentProject.deleteMany({ _id: { $in: projectIds } });
    await Investor.deleteOne({ _id: id });

    return res.status(200).json({
      deleted: { investors: 1, projects: projects.length, interactions: logs.length },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Server Error' });
  }
};
