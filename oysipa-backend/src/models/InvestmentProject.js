const mongoose = require('mongoose');

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
    estimatedNumberOfJobs: {
        type: Number,
        default: 0
    },
    location: {
        type: String,
        trim: true
    },
    lifecycleStatus: {
        type: String,
        enum: ['Idea', 'Initial Interest', 'Lead', 'Committment', 'Exisiting Investor', 'Expansion', 'Exit'],
        default: 'Initial Interest'
    },
    investor: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Investor'
    },
    assignedTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

const InvestmentProject = mongoose.model('InvestmentProject', investmentProjectSchema);

module.exports = InvestmentProject;
