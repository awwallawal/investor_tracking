// Request-scoped audit context (story 11.10).
//
// The audit plugin (utils/auditPlugin.js) reads the actor, batchId, reason and
// suppressed actions from here. An API request gets { actor: req.user } from
// the auth middleware (see `middleware` below); CLI scripts and services call
// runAs themselves.
const crypto = require('crypto');
const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

// The current context, or null outside any request / runAs.
const getContext = () => storage.getStore() || null;

// A User document, a lean user, or a request (req.user).
const toUser = (actor) => (actor && actor.user ? actor.user : actor) || null;

// Runs fn (sync or async) with `actor` as the audit actor.
// opts.batchId: shared by every row the plugin writes inside fn.
// opts.reason:  stored on those rows.
// opts.suppress: actions the plugin must not write (e.g. ['create'] for an
//                import, which writes its own `import` rows).
const runAs = (actor, fn, { batchId, reason, suppress } = {}) => storage.run({
  actor: toUser(actor),
  batchId: batchId || null,
  reason: reason || null,
  suppress: Array.isArray(suppress) ? [...suppress] : [],
}, fn);

// The current context's batchId, or null.
const contextBatchId = () => {
  const ctx = getContext();
  return (ctx && ctx.batchId) || null;
};

// Express middleware (mounted by auth, after req.user is set): the rest of the
// request runs with the logged-in user as the audit actor and one batchId, so
// every row the request writes shares it.
const middleware = (req, res, next) => storage.run({
  actor: req.user || null, batchId: crypto.randomUUID(), reason: null, suppress: [],
}, () => next());

module.exports = {
  getContext, runAs, middleware, toUser, contextBatchId,
};
