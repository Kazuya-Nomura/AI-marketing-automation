const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/config/database');

describe('Lead API', () => {
  let authToken;
  
  beforeAll(async () => {
    // Setup test database
    await pool.query('DELETE FROM leads WHERE email LIKE $1', ['%test%']);
    
    // Get auth token
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'test@example.com',
        password: 'testpassword'
      });
    
    authToken = response.body.token;
  });

  describe('POST /api/leads', () => {
    it('should create a new lead', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Lead',
          email: 'testlead@example.com',
          phone: '9876543210',
          budget_range: '1Cr-2Cr',
          interested_location: 'Goa'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.score).toBeGreaterThan(0);
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Test Lead'
          // Missing required fields
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('GET /api/leads', () => {
    it('should return paginated leads', async () => {
      const response = await request(app)
        .get('/api/leads?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toHaveProperty('page');
      expect(response.body.pagination).toHaveProperty('limit');
    });

    it('should filter by temperature', async () => {
      const response = await request(app)
        .get('/api/leads?temperature=hot')
        .set('Authorization', `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      response.body.data.forEach(lead => {
        expect(lead.temperature).toBe('hot');
      });
    });
  });

  afterAll(async () => {
    await pool.end();
  });
});