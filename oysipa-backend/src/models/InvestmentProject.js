const mongoose = require('mongoose');
const { CURRENCIES, DEFAULT_CURRENCY } = require('../constants/investorFields');

const investmentProjectSchema = new mongoose.Schema({
    projectTitle: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    estimatedValue: {
        type: Number,
        default: 0
    },
    // Currency of estimatedValue (moved here from 11.6).
    currency: {
        type: String,
        enum: { values: CURRENCIES, message: 'Invalid currency: {VALUE}' },
        default: DEFAULT_CURRENCY
    },
    estimatedNumberOfJobs: {
        type: Number,
        default: 0
    },
    location: {
        type: String,
        trim: true
    },
    lifecycleStatus: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LifecycleStatus',
        required: true
    },
    investor: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Investor'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    // Happened date the project was registered (officer-entered). No default:
    // set by the controller on create; old records display createdAt.
    dateRegistered: {
        type: Date
    },
    // Import stamps (story 11.11).
    importBatchId: {
        type: String
    },
    importTags: {
        type: [String],
        default: undefined
    }
}, {
    timestamps: true
});

const InvestmentProject = mongoose.model('InvestmentProject', investmentProjectSchema);

module.exports = InvestmentProject;
