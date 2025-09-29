const Investor = require('../models/InvestorModel');

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
