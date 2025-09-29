# 6. Database Schema

This section provides the concrete Mongoose schemas that will be used in the backend to model and validate data in MongoDB.

## 6.1. User Schema
```javascript
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['Staff', 'Portal Administrator', 'Director-General'], 
    required: true 
  },
  status: { 
    type: String, 
    enum: ['Active', 'Invited', 'Revoked'], 
    default: 'Invited', 
    required: true 
  }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

export default mongoose.model('User', userSchema);
```

## 6.2. Investor Schema
```javascript
import mongoose from 'mongoose';

const investorSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  sector: { type: String, required: true },
  countryOfOrigin: { type: String },
  companyRegistrationInfo: { type: String },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

export default mongoose.model('Investor', investorSchema);
```

## 6.3. InvestmentProject Schema
```javascript
import mongoose from 'mongoose';

const investmentProjectSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  estimatedValue: { type: Number },
  location: { type: String },
  lifecycleStage: { type: mongoose.Schema.Types.ObjectId, ref: 'LifecycleStage', required: true },
  investor: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true }
}, { timestamps: true });

export default mongoose.model('InvestmentProject', investmentProjectSchema);
```

## 6.4. InteractionLog Schema
```javascript
import mongoose from 'mongoose';

const interactionLogSchema = new mongoose.Schema({
  project: { type: mongoose.Schema.Types.ObjectId, ref: 'InvestmentProject', required: true },
  loggedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  documentUrl: { type: String }
}, { timestamps: true });

export default mongoose.model('InteractionLog', interactionLogSchema);
```

## 6.5. LifecycleStage Schema
```javascript
import mongoose from 'mongoose';

const lifecycleStageSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  order: { type: Number, required: true, unique: true },
  description: { type: String }
});

export default mongoose.model('LifecycleStage', lifecycleStageSchema);
```

## 6.6. Contact Schema
```javascript
import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  investor: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
  name: { type: String, required: true },
  email: { type: String },
  phone: { type: String },
  role: { type: String },
  isPrimary: { type: Boolean, default: false }
}, { timestamps: true });

export default mongoose.model('Contact', contactSchema);
```