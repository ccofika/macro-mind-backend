const axios = require('axios');
require('dotenv').config();

const API_URL = process.env.API_URL || 'http://localhost:5000/api';

// Test Admin Overview API
async function testAdminOverview() {
  try {
    console.log('🔍 Testing Admin Overview API...\n');

    // Test without authentication (should fail)
    console.log('1. Testing without authentication...');
    try {
      const response = await axios.get(`${API_URL}/admin/dashboard/overview`);
      console.log('❌ ERROR: Request should have failed without auth');
    } catch (error) {
      if (error.response && error.response.status === 401) {
        console.log('✅ Correctly rejected unauthenticated request');
      } else {
        console.log('❌ Unexpected error:', error.message);
      }
    }

    // Test with authentication (need to provide admin token)
    const adminToken = process.env.ADMIN_TOKEN; // You need to set this in your .env
    
    if (!adminToken) {
      console.log('\n⚠️  ADMIN_TOKEN not found in .env file');
      console.log('To test authenticated requests, add ADMIN_TOKEN to your .env file');
      return;
    }

    console.log('\n2. Testing with authentication...');
    try {
      const response = await axios.get(`${API_URL}/admin/dashboard/overview`, {
        headers: {
          'Authorization': `Bearer ${adminToken}`
        }
      });

      if (response.data.success) {
        console.log('✅ Successfully retrieved admin overview data');
        console.log('\n📊 Data Structure:');
        console.log('- Platform Stats:', Object.keys(response.data.data.platformStats || {}));
        console.log('- AI Analytics:', Object.keys(response.data.data.aiAnalytics || {}));
        console.log('- System Health:', Object.keys(response.data.data.systemHealth || {}));
        console.log('- Recent Activity:', Object.keys(response.data.data.recentActivity || {}));
        console.log('- Top Users Count:', response.data.data.topUsers?.length || 0);
      } else {
        console.log('❌ Request succeeded but returned error:', response.data.message);
      }
    } catch (error) {
      console.log('❌ Authentication failed:', error.response?.data?.message || error.message);
    }

    // Test with time range parameters
    console.log('\n3. Testing with time range parameters...');
    const timeRanges = ['1d', '7d', '30d', '90d'];
    
    for (const timeRange of timeRanges) {
      try {
        const response = await axios.get(`${API_URL}/admin/dashboard/overview?timeRange=${timeRange}`, {
          headers: {
            'Authorization': `Bearer ${adminToken}`
          }
        });

        if (response.data.success) {
          const stats = response.data.data.platformStats;
          console.log(`✅ ${timeRange}: Users=${stats?.totalUsers || 0}, Cards=${stats?.totalCards || 0}, New Users=${stats?.newUsersThisPeriod || 0}`);
        } else {
          console.log(`❌ ${timeRange}: ${response.data.message}`);
        }
      } catch (error) {
        console.log(`❌ ${timeRange}: ${error.response?.data?.message || error.message}`);
      }
    }

  } catch (error) {
    console.error('💥 Test failed with error:', error.message);
  }
}

// Run the test
if (require.main === module) {
  testAdminOverview();
}

module.exports = { testAdminOverview }; 