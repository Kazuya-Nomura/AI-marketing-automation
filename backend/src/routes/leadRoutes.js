const router = express.Router();
const leadController = require('../controllers/leadController');
const { authenticateToken } = require('../middleware/auth');
const dataValidation = require('../middleware/validation');
const { createLeadSchema } = require('../validators/schemas');

// Apply validation middleware to specific routes
router.post(
  '/leads',
  authenticateToken,
  dataValidation.validateRequest(createLeadSchema),
  leadController.createLead
);

module.exports = router;