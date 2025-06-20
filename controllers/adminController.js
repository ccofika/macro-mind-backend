const User = require('../models/User');
const Card = require('../models/Card');
const Space = require('../models/Space');
const Connection = require('../models/Connection');
const Invitation = require('../models/Invitation');
const AIChatConversation = require('../models/AIChatConversation');
const AdminAuditLog = require('../models/AdminAuditLog');
const { logAdminAction } = require('../middleware/adminMiddleware');

// ===============================
// AUTHENTICATION
// ===============================

exports.verifyToken = async (req, res) => {
  try {
    // Token verification is handled by adminAuth middleware
    // If we reach here, token is valid
    res.json({
      success: true,
      admin: {
        id: req.admin.id,
        email: req.admin.email,
        name: req.admin.name,
        role: req.admin.role
      }
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({
      success: false,
      message: 'Token verification failed'
    });
  }
};

// ===============================
// PAGE 1: OVERVIEW DASHBOARD
// ===============================

// Get comprehensive platform analytics
exports.getDashboardOverview = async (req, res) => {
  try {
    const { timeRange = '7d' } = req.query;
    
    // Calculate date range based on timeRange parameter
    let dateThreshold;
    switch (timeRange) {
      case '1d':
        dateThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        dateThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    }

    const activeUserThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Get basic counts with error handling
    const [
      totalUsers,
      activeUsers,
      totalCards,
      totalSpaces,
      totalConnections,
      totalInvitations,
      totalAIChats,
      newUsersThisPeriod,
      newCardsThisPeriod,
      newConversationsThisPeriod,
      spacesWithActivity,
      recentUsers,
      recentCards,
      recentAIChats
    ] = await Promise.allSettled([
      User.countDocuments(),
      User.countDocuments({ lastLogin: { $gte: activeUserThreshold } }),
      Card.countDocuments(),
      Space.countDocuments(),
      Connection.countDocuments(),
      Invitation.countDocuments(),
      AIChatConversation.countDocuments(),
      User.countDocuments({ createdAt: { $gte: dateThreshold } }),
      Card.countDocuments({ createdAt: { $gte: dateThreshold } }),
      AIChatConversation.countDocuments({ createdAt: { $gte: dateThreshold } }),
      Space.countDocuments({ updatedAt: { $gte: dateThreshold } }),
      User.find({ 
        $or: [
          { createdAt: { $gte: dateThreshold } },
          { lastLogin: { $gte: dateThreshold } }
        ]
      }).sort({ $natural: -1 }).limit(10).select('name email createdAt lastLogin'),
      Card.find({ createdAt: { $gte: dateThreshold } }).sort({ createdAt: -1 }).limit(10),
      AIChatConversation.find({ createdAt: { $gte: dateThreshold } }).sort({ createdAt: -1 }).limit(10).populate('userId', 'name email').catch(() => [])
    ]).then(results => results.map(result => result.status === 'fulfilled' ? result.value : (Array.isArray(result.value) ? result.value : 0)));

    console.log('✅ Basic counts retrieved successfully');
    console.log('📊 Active users:', activeUsers, 'out of total:', totalUsers);
    console.log('📊 Recent users count:', Array.isArray(recentUsers) ? recentUsers.length : 'not array');
    console.log('📊 Recent cards count:', Array.isArray(recentCards) ? recentCards.length : 'not array');

    // Get trends with error handling
    let userRegistrationTrends = [];
    let cardCreationTrends = [];
    let cardTypeDistribution = [];
    let spaceStats = {};
    let aiUsageStats = {};

    try {
      userRegistrationTrends = await User.aggregate([
        { $match: { createdAt: { $gte: dateThreshold } } },
        { 
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      console.log('✅ User registration trends retrieved');
    } catch (error) {
      console.error('❌ Error getting user registration trends:', error.message);
    }

    try {
      cardCreationTrends = await Card.aggregate([
        { $match: { createdAt: { $gte: dateThreshold } } },
        { 
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]);
      console.log('✅ Card creation trends retrieved');
    } catch (error) {
      console.error('❌ Error getting card creation trends:', error.message);
    }

    try {
      cardTypeDistribution = await Card.aggregate([
        { 
          $group: {
            _id: "$type",
            count: { $sum: 1 }
          }
        }
      ]);
      console.log('✅ Card type distribution retrieved');
    } catch (error) {
      console.error('❌ Error getting card type distribution:', error.message);
    }

    try {
      const spaceStatsArray = await Space.aggregate([
        {
          $group: {
            _id: null,
            totalSpaces: { $sum: 1 },
            publicSpaces: { $sum: { $cond: ["$isPublic", 1, 0] } },
            privateSpaces: { $sum: { $cond: ["$isPublic", 0, 1] } },
            avgMembersPerSpace: { $avg: { $size: "$members" } }
          }
        }
      ]);
      spaceStats = spaceStatsArray[0] || {};
      console.log('✅ Space stats retrieved');
    } catch (error) {
      console.error('❌ Error getting space stats:', error.message);
    }

    try {
      const aiUsageStatsArray = await AIChatConversation.aggregate([
        {
          $group: {
            _id: null,
            totalConversations: { $sum: 1 },
            totalMessages: { $sum: "$stats.messageCount" },
            totalTokensUsed: { $sum: "$stats.totalTokensUsed" },
            avgResponseTime: { $avg: "$stats.averageResponseTime" }
          }
        }
      ]);
      aiUsageStats = aiUsageStatsArray[0] || {};
      console.log('✅ AI usage stats retrieved');
    } catch (error) {
      console.error('❌ Error getting AI usage stats:', error.message);
    }

    // Manually populate user data for cards with error handling
    let recentCardsWithUsers = [];
    try {
      recentCardsWithUsers = await Promise.all(
        (recentCards || []).map(async (card) => {
          try {
            let user = null;
            
            // Try to find user by ObjectId first
            if (card.userId) {
              // If userId is already an ObjectId, try direct lookup
              if (typeof card.userId === 'object') {
                user = await User.findById(card.userId).select('name email');
              } else {
                // If userId is a string, try multiple approaches
                // First try as ObjectId
                if (card.userId.match(/^[0-9a-fA-F]{24}$/)) {
                  user = await User.findById(card.userId).select('name email');
                }
                // If not found, try as email
                if (!user) {
                  user = await User.findOne({ email: card.userId }).select('name email');
                }
              }
            }
            
            console.log(`Card ${card._id}: userId=${card.userId}, found user: ${user ? user.name : 'NOT FOUND'}`);
            
            return {
              ...card.toObject(),
              userId: user || { name: 'Unknown User', email: 'unknown@email.com' }
            };
          } catch (error) {
            console.error(`Error finding user for card ${card._id}:`, error.message);
            return {
              ...card.toObject(),
              userId: { name: 'Unknown User', email: 'unknown@email.com' }
            };
          }
        })
      );
      console.log('✅ Recent cards with users populated');
    } catch (error) {
      console.error('❌ Error populating recent cards:', error.message);
    }

    // If there are not enough recent items in the time range, fallback to all-time recent
    let finalRecentUsers = recentUsers;
    let finalRecentCards = recentCardsWithUsers;
    let finalRecentAIChats = recentAIChats;

    if (!Array.isArray(recentUsers) || recentUsers.length < 3) {
      console.log('⚠️ Not enough recent users in timeRange, getting users with recent activity');
      try {
        // Get users who have created cards recently
        const usersWithRecentCards = await Card.aggregate([
          { $match: { createdAt: { $gte: dateThreshold } } },
          { $group: { _id: "$userId", lastCardCreated: { $max: "$createdAt" } } },
          { $sort: { lastCardCreated: -1 } },
          { $limit: 10 },
          {
            $addFields: {
              userObjectId: {
                $cond: {
                  if: { $eq: [{ $strLenCP: "$_id" }, 24] },
                  then: { 
                    $cond: {
                      if: { $regexMatch: { input: "$_id", regex: /^[0-9a-fA-F]{24}$/ } },
                      then: { $toObjectId: "$_id" },
                      else: null
                    }
                  },
                  else: null
                }
              }
            }
          },
          {
            $lookup: {
              from: "users",
              let: { userId: "$_id", userObjId: "$userObjectId" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $or: [
                        { $eq: ["$_id", "$$userObjId"] },
                        { $eq: [{ $toString: "$_id" }, "$$userId"] },
                        { $eq: ["$email", "$$userId"] }
                      ]
                    }
                  }
                }
              ],
              as: "user"
            }
          },
          { 
            $addFields: {
              user: { $arrayElemAt: ["$user", 0] }
            }
          },
          {
            $project: {
              _id: "$user._id",
              name: "$user.name",
              email: "$user.email", 
              createdAt: "$user.createdAt",
              lastLogin: "$user.lastLogin",
              lastCardCreated: 1
            }
          }
        ]);

        if (usersWithRecentCards.length > 0) {
          finalRecentUsers = usersWithRecentCards;
          console.log(`✅ Found ${usersWithRecentCards.length} users with recent card activity`);
        } else {
          // Fallback to all-time recent users
          finalRecentUsers = await User.find().sort({ createdAt: -1 }).limit(10).select('name email createdAt lastLogin');
          console.log('📋 Using all-time recent users as fallback');
        }
      } catch (error) {
        console.error('❌ Error getting recent active users:', error.message);
        finalRecentUsers = [];
      }
    }

    if (!Array.isArray(recentCardsWithUsers) || recentCardsWithUsers.length < 3) {
      console.log('⚠️ Not enough recent cards in timeRange, falling back to all-time');
      try {
        const fallbackCards = await Card.find().sort({ createdAt: -1 }).limit(10);
        finalRecentCards = await Promise.all(
          fallbackCards.map(async (card) => {
            try {
              let user = null;
              
              // Try to find user by ObjectId first
              if (card.userId) {
                // If userId is already an ObjectId, try direct lookup
                if (typeof card.userId === 'object') {
                  user = await User.findById(card.userId).select('name email');
                } else {
                  // If userId is a string, try multiple approaches
                  // First try as ObjectId
                  if (card.userId.match(/^[0-9a-fA-F]{24}$/)) {
                    user = await User.findById(card.userId).select('name email');
                  }
                  // If not found, try as email
                  if (!user) {
                    user = await User.findOne({ email: card.userId }).select('name email');
                  }
                }
              }
              
              console.log(`Fallback Card ${card._id}: userId=${card.userId}, found user: ${user ? user.name : 'NOT FOUND'}`);
              
              return {
                ...card.toObject(),
                userId: user || { name: 'Unknown User', email: 'unknown@email.com' }
              };
            } catch (error) {
              console.error(`Error finding user for fallback card ${card._id}:`, error.message);
              return {
                ...card.toObject(),
                userId: { name: 'Unknown User', email: 'unknown@email.com' }
              };
            }
          })
        );
      } catch (error) {
        console.error('❌ Error getting fallback recent cards:', error.message);
        finalRecentCards = [];
      }
    }

    if (!Array.isArray(recentAIChats) || recentAIChats.length < 2) {
      console.log('⚠️ Not enough recent AI chats in timeRange, falling back to all-time');
      try {
        finalRecentAIChats = await AIChatConversation.find().sort({ createdAt: -1 }).limit(10).populate('userId', 'name email');
      } catch (error) {
        console.error('❌ Error getting fallback recent AI chats:', error.message);
        finalRecentAIChats = [];
      }
    }

    // Get top users by activity
    const topUsersByCards = await Card.aggregate([
      {
        $group: {
          _id: "$userId", 
          cardCount: { $sum: 1 },
          totalCards: { $sum: 1 }
        }
      },
      { $sort: { cardCount: -1 } },
      { $limit: 10 },
      {
        $addFields: {
          userObjectId: {
            $cond: {
              if: { $eq: [{ $strLenCP: "$_id" }, 24] },
              then: { 
                $cond: {
                  if: { $regexMatch: { input: "$_id", regex: /^[0-9a-fA-F]{24}$/ } },
                  then: { $toObjectId: "$_id" },
                  else: null
                }
              },
              else: null
            }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          let: { userId: "$_id", userObjId: "$userObjectId" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$_id", "$$userObjId"] },
                    { $eq: [{ $toString: "$_id" }, "$$userId"] },
                    { $eq: ["$email", "$$userId"] }
                  ]
                }
              }
            }
          ],
          as: "user"
        }
      },
      { 
        $addFields: {
          user: { $arrayElemAt: ["$user", 0] }
        }
      },
      {
        $project: {
          _id: "$_id",
          cardCount: 1,
          totalCards: 1,
          name: { $ifNull: ["$user.name", "Unknown User"] },
          email: { $ifNull: ["$user.email", "unknown@email.com"] }
        }
      }
    ]).catch(error => {
      console.error('Error in topUsersByCards aggregation:', error);
      return []; // Return empty array on error
    });

    console.log('✅ Top users by cards retrieved');

    // Calculate average connections per card
    const avgConnectionsPerCard = totalCards > 0 ? Math.round(totalConnections / totalCards * 100) / 100 : 0;

    // System health mock data (you can replace with real monitoring data)
    const systemHealth = {
      avgResponseTime: 120,
      memoryUsage: 78,
      diskUsage: 45,
      cpuUsage: 65,
      status: 'healthy'
    };

    const overview = {
      platformStats: {
        totalUsers,
        activeUsers,
        totalCards,
        totalSpaces,
        totalConnections,
        totalInvitations,
        newUsersThisPeriod,
        newCardsThisPeriod,  
        spacesWithActivity,
        avgConnectionsPerCard,
        inactiveUsers: totalUsers - activeUsers
      },
      trends: {
        userRegistration: userRegistrationTrends,
        cardCreation: cardCreationTrends
      },
      distributions: {
        cardTypes: cardTypeDistribution,
        spaceStats: spaceStats
      },
      aiAnalytics: {
        totalConversations: totalAIChats,
        newConversationsThisPeriod,
        totalMessages: aiUsageStats.totalMessages || 0,
        totalTokensUsed: aiUsageStats.totalTokensUsed || 0,
        avgResponseTime: aiUsageStats.avgResponseTime || 0
      },
      topUsers: topUsersByCards,
      recentActivity: {
        users: finalRecentUsers,
        cards: finalRecentCards,
        aiChats: finalRecentAIChats
      },
      systemHealth
    };

    console.log('✅ Dashboard overview data compiled successfully');
    console.log('📊 Recent Activity Summary:');
    console.log('  - Users:', Array.isArray(overview.recentActivity.users) ? overview.recentActivity.users.length : 'not array');
    console.log('  - Cards:', Array.isArray(overview.recentActivity.cards) ? overview.recentActivity.cards.length : 'not array');
    console.log('  - AI Chats:', Array.isArray(overview.recentActivity.aiChats) ? overview.recentActivity.aiChats.length : 'not array');
    console.log('📊 Platform Stats:');
    console.log('  - Active users:', overview.platformStats.activeUsers);
    console.log('  - Total users:', overview.platformStats.totalUsers);
    
    res.json({ success: true, data: overview });
  } catch (error) {
    console.error('💥 Dashboard overview error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load dashboard overview',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// ===============================
// PAGE 2: USERS & CARDS ANALYTICS
// ===============================

// Get detailed user and card analytics
exports.getUsersAndCardsAnalytics = async (req, res) => {
  try {
    console.log('🚀 Starting Users & Cards Analytics request...');
    
    const { 
      page = 1, 
      limit = 20, 
      search = '', 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      timeRange = '30d',
      filterBy = 'all'
    } = req.query;
    
    const skip = (page - 1) * limit;
    console.log(`📋 Request parameters: page=${page}, limit=${limit}, search="${search}", sortBy="${sortBy}", timeRange="${timeRange}", filterBy="${filterBy}"`);

    // Calculate date range based on timeRange parameter
    let dateThreshold;
    switch (timeRange) {
      case '7d':
        dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        dateThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        dateThreshold = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    // Active user threshold (30 days)
    const activeUserThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Build search query
    let searchQuery = {};
    if (search) {
      searchQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Apply filter
    if (filterBy === 'active') {
      searchQuery.lastLogin = { $gte: activeUserThreshold };
    } else if (filterBy === 'inactive') {
      searchQuery.$or = [
        { lastLogin: { $lt: activeUserThreshold } },
        { lastLogin: { $exists: false } }
      ];
    }

    console.log('🔍 Search query:', JSON.stringify(searchQuery));

    // Get users with their card counts using proper aggregation
    const usersAggregation = [
      { $match: searchQuery },
      {
        $lookup: {
          from: "cards",
          let: { 
            userIdString: { $toString: "$_id" },
            userEmail: "$email"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$userId", "$$userIdString"] },
                    { $eq: ["$userId", "$$userEmail"] },
                    { $eq: [{ $toString: "$userId" }, "$$userIdString"] }
                  ]
                }
              }
            }
          ],
          as: "userCards"
        }
      },
      {
        $lookup: {
          from: "spaces",
          let: { 
            userIdString: { $toString: "$_id" },
            userEmail: "$email"
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$ownerId", "$$userIdString"] },
                    { $eq: ["$ownerId", "$$userEmail"] },
                    { $eq: [{ $toString: "$ownerId" }, "$$userIdString"] }
                  ]
                }
              }
            }
          ],
          as: "ownedSpaces"
        }
      },
      {
        $addFields: {
          cardCount: { $size: "$userCards" },
          spaceCount: { $size: "$ownedSpaces" },
          isActive: {
            $cond: {
              if: { 
                $and: [
                  { $ne: ["$lastLogin", null] },
                  { $gte: ["$lastLogin", activeUserThreshold] }
                ]
              },
              then: true,
              else: false
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          createdAt: 1,
          lastLogin: 1,
          role: 1,
          cardCount: 1,
          spaceCount: 1,
          isActive: 1,
          suspended: { $ifNull: ["$suspended", false] }
        }
      },
      { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } }
    ];

    // Get total count first
    const totalCountPipeline = [...usersAggregation, { $count: "total" }];
    const totalCountResult = await User.aggregate(totalCountPipeline);
    const totalUsers = totalCountResult.length > 0 ? totalCountResult[0].total : 0;

    // Get paginated users
    const users = await User.aggregate([
      ...usersAggregation,
      { $skip: skip },
      { $limit: parseInt(limit) }
    ]);

    console.log(`👥 Found ${users.length} users on page ${page} of ${Math.ceil(totalUsers / limit)}`);
    
    // Debug user data
    if (users.length > 0) {
      console.log('📊 Debug - First user sample:', {
        id: users[0]._id,
        name: users[0].name,
        email: users[0].email,
        cardCount: users[0].cardCount,
        spaceCount: users[0].spaceCount,
        lastLogin: users[0].lastLogin,
        isActive: users[0].isActive,
        suspended: users[0].suspended
      });
    }

    // Get comprehensive card analytics
    const [totalCards, cardStats, cardCreators] = await Promise.all([
      // Total cards count
      Card.countDocuments(),
      
      // Cards created in time period
      Card.aggregate([
        {
          $facet: {
            totalCards: [{ $count: "count" }],
            newCards: [
              { $match: { createdAt: { $gte: dateThreshold } } },
              { $count: "count" }
            ],
            cardTypes: [
              {
                $group: {
                  _id: "$type",
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } }
            ],
            activeUsers: [
              {
                $group: {
                  _id: "$userId",
                  cardCount: { $sum: 1 }
                }
              },
              { $match: { cardCount: { $gt: 0 } } },
              { $count: "count" }
            ]
          }
        }
      ]),

      // Top card creators with user details
      Card.aggregate([
      {
        $group: {
          _id: "$userId",
          cardCount: { $sum: 1 },
            lastCardCreated: { $max: "$createdAt" },
            cardTypes: { $addToSet: "$type" }
          }
        },
        { $sort: { cardCount: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: "users",
            let: { userId: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $or: [
                      // Try direct ObjectId match if userId is ObjectId
                      {
                        $and: [
                          { $eq: [{ $type: "$$userId" }, "objectId"] },
                          { $eq: ["$_id", "$$userId"] }
                        ]
                      },
                      // Try email match if userId is string (email)
                      {
                        $and: [
                          { $eq: [{ $type: "$$userId" }, "string"] },
                          { $eq: ["$email", "$$userId"] }
                        ]
                      },
                      // Try string conversion match
                      { $eq: [{ $toString: "$_id" }, { $toString: "$$userId" }] }
                    ]
                  }
                }
              }
            ],
            as: "userInfo"
          }
        },
        {
          $addFields: {
            userDetails: { $arrayElemAt: ["$userInfo", 0] },
            name: { $ifNull: [{ $arrayElemAt: ["$userInfo.name", 0] }, "Unknown User"] },
            email: { $ifNull: [{ $arrayElemAt: ["$userInfo.email", 0] }, "unknown@example.com"] }
          }
        },
        {
          $project: {
            _id: 1,
            cardCount: 1,
            lastCardCreated: 1,
            cardTypes: 1,
            name: 1,
            email: 1,
            userDetails: 1
          }
        }
      ])
    ]);

    const cardStatsData = cardStats[0] || {};
    const totalCardsCount = cardStatsData.totalCards?.[0]?.count || 0;
    const newCardsCount = cardStatsData.newCards?.[0]?.count || 0;
    const activeUsersCount = cardStatsData.activeUsers?.[0]?.count || 0;
    
    console.log(`🎴 Card stats: total=${totalCardsCount}, new=${newCardsCount}, active_users=${activeUsersCount}`);

    // Get space collaboration patterns
    const collaborationStats = await Space.aggregate([
      {
        $facet: {
          overview: [
      {
        $group: {
          _id: null,
                totalSpaces: { $sum: 1 },
          publicSpaceCount: { $sum: { $cond: ["$isPublic", 1, 0] } },
          privateSpaceCount: { $sum: { $cond: ["$isPublic", 0, 1] } },
                avgMembersPerSpace: { $avg: { $size: "$members" } },
                totalMembers: { $sum: { $size: "$members" } }
              }
            }
          ],
          spacesInPeriod: [
            { $match: { createdAt: { $gte: dateThreshold } } },
            { $count: "count" }
          ]
        }
      }
    ]);

    const collaborationData = collaborationStats[0]?.overview?.[0] || {};
    const newSpacesThisPeriod = collaborationStats[0]?.spacesInPeriod?.[0]?.count || 0;

    console.log('🏢 Collaboration stats:', collaborationData);
    console.log('📊 Debug - collaboration stats breakdown:');
    console.log('  - totalSpaces:', collaborationData.totalSpaces);
    console.log('  - publicSpaceCount:', collaborationData.publicSpaceCount);
    console.log('  - privateSpaceCount:', collaborationData.privateSpaceCount);
    console.log('  - avgMembersPerSpace:', collaborationData.avgMembersPerSpace);
    console.log('  - totalMembers:', collaborationData.totalMembers);
    console.log('  - newSpacesThisPeriod:', newSpacesThisPeriod);

    // Get connection patterns with error handling
    let connectionStats = {
      totalConnections: 0,
      avgConnectionsPerUser: 0,
      activeConnectors: 0,
      maxConnections: 0
    };

    try {
      const connectionData = await Connection.aggregate([
        {
          $facet: {
            totalConnections: [{ $count: "count" }],
            userConnections: [
      {
        $group: {
          _id: "$userId",
          connectionCount: { $sum: 1 }
        }
              }
            ],
            newConnections: [
              { $match: { createdAt: { $gte: dateThreshold } } },
              { $count: "count" }
            ]
        }
      }
    ]);

      const connectionsData = connectionData[0] || {};
      const totalConnections = connectionsData.totalConnections?.[0]?.count || 0;
      const userConnections = connectionsData.userConnections || [];
      const newConnections = connectionsData.newConnections?.[0]?.count || 0;

      connectionStats = {
        totalConnections,
        newConnectionsThisPeriod: newConnections,
        avgConnectionsPerUser: userConnections.length > 0 ? 
          Math.round((totalConnections / userConnections.length) * 100) / 100 : 0,
        activeConnectors: userConnections.length,
        maxConnections: userConnections.length > 0 ? 
          Math.max(...userConnections.map(u => u.connectionCount)) : 0
      };
    } catch (error) {
      console.error('⚠️ Error getting connection stats:', error.message);
    }

    console.log('🔗 Connection stats:', connectionStats);

    // Build comprehensive analytics response
    const analytics = {
      users: {
        data: users,
        totalCount: totalUsers,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit)
      },
      cardAnalytics: {
        // Data for overview tab
        totalCards: totalCardsCount,
        newCardsThisPeriod: newCardsCount,
        activeUsers: activeUsersCount,
        newUsersThisPeriod: users.filter(u => new Date(u.createdAt) >= dateThreshold).length,
        avgCardsPerUser: totalUsers > 0 ? Math.round((totalCardsCount / totalUsers) * 100) / 100 : 0,
        
        // Card type distribution
        cardTypeDistribution: cardStatsData.cardTypes || [],
        
        // Top creators properly structured
        topCreators: cardCreators || []
      },
      collaborationPatterns: {
        ...collaborationData,
        newSpacesThisPeriod,
        // Additional metrics
        collaborationRate: collaborationData.totalSpaces > 0 ? 
          Math.round((collaborationData.totalMembers / collaborationData.totalSpaces) * 100) / 100 : 0
      },
      connectionPatterns: connectionStats
    };

    console.log('✅ Users & Cards analytics completed successfully');
    console.log(`📊 Response summary: ${users.length} users, ${totalCardsCount} cards, ${connectionStats.totalConnections} connections`);

    res.json({ success: true, data: analytics });

  } catch (error) {
    console.error('💥 Users and cards analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
};

// Get trends analytics for Users & Cards
exports.getUsersCardsTrends = async (req, res) => {
  try {
    console.log('🚀 Starting Users & Cards Trends Analytics...');
    
    const { timeRange = '30d' } = req.query;
    
    // Calculate date ranges
    const now = new Date();
    const getRangeDate = (range) => {
      const multipliers = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
      const days = multipliers[range] || 30;
      return new Date(now - days * 24 * 60 * 60 * 1000);
    };
    
    const startDate = getRangeDate(timeRange);
    const intervals = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 30 : 52;
    const intervalDays = timeRange === '7d' ? 1 : timeRange === '30d' ? 1 : timeRange === '90d' ? 3 : 7;
    
    console.log(`📊 Analyzing trends for ${timeRange} with ${intervals} data points`);

    // Generate time series data
    const [userTrends, cardTrends, spaceTrends, connectionTrends] = await Promise.all([
      // User registration trends
      User.aggregate([
        {
          $match: { createdAt: { $gte: startDate } }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: timeRange === '1y' ? "%Y-%U" : "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            count: { $sum: 1 },
            date: { $first: "$createdAt" }
          }
        },
        { $sort: { "_id": 1 } }
      ]),

      // Card creation trends
      Card.aggregate([
        {
          $match: { createdAt: { $gte: startDate } }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: timeRange === '1y' ? "%Y-%U" : "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            count: { $sum: 1 },
            types: { $addToSet: "$type" },
            date: { $first: "$createdAt" }
          }
        },
        { $sort: { "_id": 1 } }
      ]),

      // Space creation trends
      Space.aggregate([
        {
          $match: { createdAt: { $gte: startDate } }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: timeRange === '1y' ? "%Y-%U" : "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            count: { $sum: 1 },
            publicSpaces: { $sum: { $cond: ["$isPublic", 1, 0] } },
            privateSpaces: { $sum: { $cond: ["$isPublic", 0, 1] } },
            date: { $first: "$createdAt" }
          }
        },
        { $sort: { "_id": 1 } }
      ]),

      // Connection creation trends
      Connection.aggregate([
        {
          $match: { createdAt: { $gte: startDate } }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: timeRange === '1y' ? "%Y-%U" : "%Y-%m-%d",
                date: "$createdAt"
              }
            },
            count: { $sum: 1 },
            date: { $first: "$createdAt" }
          }
        },
        { $sort: { "_id": 1 } }
      ])
    ]);

    // Calculate growth rates and insights
    const calculateGrowthRate = (trends) => {
      if (trends.length < 2) return 0;
      const recent = trends.slice(-7).reduce((sum, item) => sum + item.count, 0);
      const previous = trends.slice(-14, -7).reduce((sum, item) => sum + item.count, 0);
      return previous > 0 ? Math.round(((recent - previous) / previous) * 100) : 0;
    };

    // User engagement analysis
    const activeUserThreshold = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const [engagementStats, velocityStats] = await Promise.all([
      User.aggregate([
        {
          $facet: {
            totalUsers: [{ $count: "count" }],
            activeUsers: [
              { $match: { lastLogin: { $gte: activeUserThreshold } } },
              { $count: "count" }
            ],
            newUsers: [
              { $match: { createdAt: { $gte: startDate } } },
              { $count: "count" }
            ]
          }
        }
      ]),

      Card.aggregate([
        {
          $facet: {
            dailyAverage: [
              { $match: { createdAt: { $gte: startDate } } },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  count: { $sum: 1 }
                }
              },
              {
                $group: {
                  _id: null,
                  avgPerDay: { $avg: "$count" }
                }
              }
            ],
            peakDay: [
              { $match: { createdAt: { $gte: startDate } } },
              {
                $group: {
                  _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                  count: { $sum: 1 }
                }
              },
              { $sort: { count: -1 } },
              { $limit: 1 }
            ]
          }
        }
      ])
    ]);

    const engagement = engagementStats[0] || {};
    const velocity = velocityStats[0] || {};

    const trends = {
      timeRange,
      dateRange: {
        start: startDate.toISOString(),
        end: now.toISOString()
      },
      series: {
        users: userTrends.map(item => ({
          date: item._id,
          value: item.count,
          timestamp: new Date(item.date).getTime()
        })),
        cards: cardTrends.map(item => ({
          date: item._id,
          value: item.count,
          types: item.types,
          timestamp: new Date(item.date).getTime()
        })),
        spaces: spaceTrends.map(item => ({
          date: item._id,
          value: item.count,
          publicSpaces: item.publicSpaces,
          privateSpaces: item.privateSpaces,
          timestamp: new Date(item.date).getTime()
        })),
        connections: connectionTrends.map(item => ({
          date: item._id,
          value: item.count,
          timestamp: new Date(item.date).getTime()
        }))
      },
      insights: {
        userGrowthRate: calculateGrowthRate(userTrends),
        cardGrowthRate: calculateGrowthRate(cardTrends),
        spaceGrowthRate: calculateGrowthRate(spaceTrends),
        connectionGrowthRate: calculateGrowthRate(connectionTrends),
        engagement: {
          totalUsers: engagement.totalUsers?.[0]?.count || 0,
          activeUsers: engagement.activeUsers?.[0]?.count || 0,
          newUsers: engagement.newUsers?.[0]?.count || 0,
          activityRate: engagement.totalUsers?.[0]?.count > 0 ? 
            Math.round((engagement.activeUsers?.[0]?.count / engagement.totalUsers?.[0]?.count) * 100) : 0
        },
        velocity: {
          avgCardsPerDay: Math.round((velocity.dailyAverage?.[0]?.avgPerDay || 0) * 100) / 100,
          peakDay: velocity.peakDay?.[0] || null
        }
      },
      summary: {
        totalDataPoints: userTrends.length + cardTrends.length + spaceTrends.length + connectionTrends.length,
        analysisQuality: userTrends.length > 5 ? 'high' : userTrends.length > 2 ? 'medium' : 'low'
      }
    };

    console.log('📈 Trends analysis completed:', {
      userDataPoints: userTrends.length,
      cardDataPoints: cardTrends.length,
      spaceDataPoints: spaceTrends.length,
      connectionDataPoints: connectionTrends.length
    });

    res.json({ success: true, data: trends });

  } catch (error) {
    console.error('💥 Trends analytics error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
};

// ===============================
// PAGE 3: AI ANALYTICS
// ===============================

// Get comprehensive AI usage analytics
exports.getAIAnalytics = async (req, res) => {
  try {
    // Get AI usage by mode
    const usageByMode = await AIChatConversation.aggregate([
      { $unwind: "$messages" },
      {
        $group: {
          _id: "$messages.mode",
          count: { $sum: 1 },
          avgConfidence: { $avg: "$messages.confidence" },
          avgProcessingTime: { $avg: "$messages.metadata.processingTime" },
          totalTokens: { $sum: "$messages.metadata.tokensUsed" }
        }
      },
      { $sort: { count: -1 } }
    ]);

    // Get daily AI usage trends (last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dailyUsageTrends = await AIChatConversation.aggregate([
      { $match: { createdAt: { $gte: thirtyDaysAgo } } },
      { $unwind: "$messages" },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$messages.timestamp" } },
          messageCount: { $sum: 1 },
          uniqueUsers: { $addToSet: "$userId" },
          totalTokens: { $sum: "$messages.metadata.tokensUsed" }
        }
      },
      {
        $addFields: {
          uniqueUserCount: { $size: "$uniqueUsers" }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Get user adoption patterns
    const userAdoption = await AIChatConversation.aggregate([
      {
        $group: {
          _id: "$userId",
          conversationCount: { $sum: 1 },
          messageCount: { $sum: "$stats.messageCount" },
          totalTokens: { $sum: "$stats.totalTokensUsed" },
          avgResponseTime: { $avg: "$stats.averageResponseTime" },
          lastActivity: { $max: "$updatedAt" }
        }
      },
      { $sort: { messageCount: -1 } },
      { $limit: 50 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" },
      {
        $project: {
          userId: "$_id",
          conversationCount: 1,
          messageCount: 1,
          totalTokens: 1,
          avgResponseTime: 1,
          lastActivity: 1,
          userName: "$user.name",
          userEmail: "$user.email"
        }
      }
    ]);

    // Get performance metrics
    const performanceMetrics = await AIChatConversation.aggregate([
      { $unwind: "$messages" },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: "$messages.metadata.processingTime" },
          avgTokensPerMessage: { $avg: "$messages.metadata.tokensUsed" },
          avgConfidence: { $avg: "$messages.confidence" },
          totalMessages: { $sum: 1 },
          successfulMessages: { 
            $sum: { $cond: [{ $gte: ["$messages.confidence", 70] }, 1, 0] }
          }
        }
      },
      {
        $addFields: {
          successRate: { $multiply: [{ $divide: ["$successfulMessages", "$totalMessages"] }, 100] }
        }
      }
    ]);

    // Get error patterns
    const errorPatterns = await AIChatConversation.aggregate([
      { $unwind: "$messages" },
      { $match: { "messages.type": "error" } },
      {
        $group: {
          _id: "$messages.content",
          count: { $sum: 1 },
          latestOccurrence: { $max: "$messages.timestamp" }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Get feature usage statistics
    const featureUsage = await AIChatConversation.aggregate([
      { $unwind: "$messages" },
      {
        $group: {
          _id: {
            mode: "$messages.mode",
            date: { $dateToString: { format: "%Y-%m-%d", date: "$messages.timestamp" } }
          },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: "$_id.mode",
          dailyUsage: { $push: { date: "$_id.date", count: "$count" } },
          totalUsage: { $sum: "$count" }
        }
      },
      { $sort: { totalUsage: -1 } }
    ]);

    const aiAnalytics = {
      usageByMode,
      dailyTrends: dailyUsageTrends,
      userAdoption,
      performanceMetrics: performanceMetrics[0] || {},
      errorPatterns,
      featureUsage
    };

    res.json({ success: true, data: aiAnalytics });
  } catch (error) {
    console.error('AI analytics error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// PAGE 4: USER MANAGEMENT
// ===============================

// Get all users with management capabilities
exports.getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', status = 'all', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    let query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    if (status !== 'all') {
      if (status === 'active') {
        query.lastLogin = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
      } else if (status === 'inactive') {
        query.$or = [
          { lastLogin: { $lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          { lastLogin: { $exists: false } }
        ];
      } else if (status === 'locked') {
        query.lockedUntil = { $gt: new Date() };
      }
    }

    const users = await User.find(query)
      .select('-password -googleId')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalUsers = await User.countDocuments(query);

    // Get additional stats for each user
    const userIds = users.map(user => user._id);
    const [cardCounts, spaceCounts, aiChatCounts] = await Promise.all([
      Card.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } }
      ]),
      Space.aggregate([
        { $match: { ownerId: { $in: userIds } } },
        { $group: { _id: "$ownerId", count: { $sum: 1 } } }
      ]),
      AIChatConversation.aggregate([
        { $match: { userId: { $in: userIds } } },
        { $group: { _id: "$userId", count: { $sum: 1 } } }
      ])
    ]);

    // Map counts back to users
    const cardCountMap = Object.fromEntries(cardCounts.map(item => [item._id.toString(), item.count]));
    const spaceCountMap = Object.fromEntries(spaceCounts.map(item => [item._id.toString(), item.count]));
    const aiChatCountMap = Object.fromEntries(aiChatCounts.map(item => [item._id.toString(), item.count]));

    const enrichedUsers = users.map(user => ({
      ...user.toObject(),
      stats: {
        cardCount: cardCountMap[user._id.toString()] || 0,
        spaceCount: spaceCountMap[user._id.toString()] || 0,
        aiChatCount: aiChatCountMap[user._id.toString()] || 0
      }
    }));

    res.json({
      success: true,
      data: {
        users: enrichedUsers,
        totalCount: totalUsers,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalUsers / limit)
      }
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update user data
exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove sensitive fields that shouldn't be updated directly
    delete updates.password;
    delete updates.googleId;
    delete updates._id;

    const oldUser = await User.findById(id);
    if (!oldUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updatedUser = await User.findByIdAndUpdate(id, updates, { new: true }).select('-password -googleId');

    res.json({ success: true, data: updatedUser });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Suspend/Activate user
exports.toggleUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { suspend } = req.body;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (suspend) {
      user.lockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    } else {
      user.lockedUntil = null;
      user.loginAttempts = 0;
    }

    await user.save();

    res.json({ 
      success: true, 
      message: suspend ? 'User suspended successfully' : 'User activated successfully',
      data: user
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete user and all associated data
exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if user exists
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Delete all associated data
    await Promise.all([
      Card.deleteMany({ userId: id }),
      Connection.deleteMany({ userId: id }),
      Space.deleteMany({ ownerId: id }),
      Invitation.deleteMany({ $or: [{ inviterUserId: id }, { inviteeUserId: id }] }),
      AIChatConversation.deleteMany({ userId: id }),
      User.findByIdAndDelete(id)
    ]);

    res.json({ success: true, message: 'User and all associated data deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Export user data (GDPR compliant)
exports.exportUserData = async (req, res) => {
  try {
    const { id } = req.params;

    const [user, cards, spaces, connections, invitations, aiChats] = await Promise.all([
      User.findById(id).select('-password -googleId'),
      Card.find({ userId: id }),
      Space.find({ ownerId: id }),
      Connection.find({ userId: id }),
      Invitation.find({ $or: [{ inviterUserId: id }, { inviteeUserId: id }] }),
      AIChatConversation.find({ userId: id })
    ]);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const exportData = {
      user,
      cards,
      spaces,
      connections,
      invitations,
      aiChats,
      exportedAt: new Date(),
      exportedBy: req.admin.email
    };

    res.json({ success: true, data: exportData });
  } catch (error) {
    console.error('Export user data error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// PAGE 5: AI MANAGEMENT
// ===============================

// Get all AI chat conversations with management capabilities
exports.getAllAIChats = async (req, res) => {
  try {
    const { page = 1, limit = 50, search = '', userId = '', sortBy = 'createdAt', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    // Build query
    let query = {};
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { 'messages.content': { $regex: search, $options: 'i' } }
      ];
    }
    if (userId) {
      query.userId = userId;
    }

    const conversations = await AIChatConversation.find(query)
      .populate('userId', 'name email')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalConversations = await AIChatConversation.countDocuments(query);

    res.json({
      success: true,
      data: {
        conversations,
        totalCount: totalConversations,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalConversations / limit)
      }
    });
  } catch (error) {
    console.error('Get all AI chats error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get specific conversation details
exports.getConversationDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await AIChatConversation.findById(id)
      .populate('userId', 'name email picture');

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    res.json({ success: true, data: conversation });
  } catch (error) {
    console.error('Get conversation details error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Delete AI conversation
exports.deleteAIConversation = async (req, res) => {
  try {
    const { id } = req.params;

    const conversation = await AIChatConversation.findByIdAndDelete(id);
    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Conversation not found' });
    }

    res.json({ success: true, message: 'Conversation deleted successfully' });
  } catch (error) {
    console.error('Delete AI conversation error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// PAGE 6: DATABASE MANAGEMENT
// ===============================

// Get database collections overview
exports.getDatabaseOverview = async (req, res) => {
  try {
    const collections = [
      { name: 'users', model: User },
      { name: 'cards', model: Card },
      { name: 'spaces', model: Space },
      { name: 'connections', model: Connection },
      { name: 'invitations', model: Invitation },
      { name: 'aichatconversations', model: AIChatConversation },
      { name: 'adminauditlogs', model: AdminAuditLog }
    ];

    const collectionStats = await Promise.all(
      collections.map(async (collection) => {
        const count = await collection.model.countDocuments();
        const sampleDoc = await collection.model.findOne();
        
        return {
          name: collection.name,
          count,
          sampleFields: sampleDoc ? Object.keys(sampleDoc.toObject()) : [],
          lastUpdated: sampleDoc ? sampleDoc.updatedAt || sampleDoc.createdAt : null
        };
      })
    );

    res.json({ success: true, data: collectionStats });
  } catch (error) {
    console.error('Database overview error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get collection data with pagination
exports.getCollectionData = async (req, res) => {
  try {
    const { collection } = req.params;
    const { page = 1, limit = 50, search = '', sortBy = '_id', sortOrder = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    const modelMap = {
      users: User,
      cards: Card,
      spaces: Space,
      connections: Connection,
      invitations: Invitation,
      aichatconversations: AIChatConversation,
      adminauditlogs: AdminAuditLog
    };

    const Model = modelMap[collection];
    if (!Model) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }

    // Build search query
    let query = {};
    if (search) {
      // Simple text search across string fields
      const sampleDoc = await Model.findOne();
      if (sampleDoc) {
        const stringFields = Object.keys(sampleDoc.toObject()).filter(key => 
          typeof sampleDoc[key] === 'string'
        );
        
        if (stringFields.length > 0) {
          query.$or = stringFields.map(field => ({
            [field]: { $regex: search, $options: 'i' }
          }));
        }
      }
    }

    const data = await Model.find(query)
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalCount = await Model.countDocuments(query);

    res.json({
      success: true,
      data: {
        documents: data,
        totalCount,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / limit)
      }
    });
  } catch (error) {
    console.error('Get collection data error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Execute database query (with safety checks)
exports.executeQuery = async (req, res) => {
  try {
    const { collection, operation, query: queryString, update } = req.body;

    const modelMap = {
      users: User,
      cards: Card,
      spaces: Space,
      connections: Connection,
      invitations: Invitation,
      aichatconversations: AIChatConversation,
      adminauditlogs: AdminAuditLog
    };

    const Model = modelMap[collection];
    if (!Model) {
      return res.status(404).json({ success: false, message: 'Collection not found' });
    }

    let query, result;
    
    try {
      query = queryString ? JSON.parse(queryString) : {};
    } catch (err) {
      return res.status(400).json({ success: false, message: 'Invalid query JSON' });
    }

    // Safety checks - prevent dangerous operations
    const dangerousOperations = ['deleteMany', 'drop', 'remove'];
    if (dangerousOperations.includes(operation)) {
      return res.status(403).json({ 
        success: false, 
        message: 'Dangerous operation not allowed through query interface' 
      });
    }

    switch (operation) {
      case 'find':
        result = await Model.find(query).limit(100); // Limit results
        break;
      case 'findOne':
        result = await Model.findOne(query);
        break;
      case 'count':
        result = await Model.countDocuments(query);
        break;
      case 'aggregate':
        if (Array.isArray(query)) {
          result = await Model.aggregate(query);
        } else {
          throw new Error('Aggregate query must be an array');
        }
        break;
      case 'updateOne':
        if (!update) {
          throw new Error('Update object required for updateOne');
        }
        result = await Model.updateOne(query, JSON.parse(update));
        break;
      default:
        return res.status(400).json({ success: false, message: 'Unsupported operation' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Execute query error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get admin audit logs
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 100, action = '', adminId = '' } = req.query;
    const skip = (page - 1) * limit;

    let query = {};
    if (action) query.action = action;
    if (adminId) query.adminUserId = adminId;

    const logs = await AdminAuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const totalLogs = await AdminAuditLog.countDocuments(query);

    res.json({
      success: true,
      data: {
        logs,
        totalCount: totalLogs,
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalLogs / limit)
      }
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ===============================
// EXPORT FUNCTIONALITY
// ===============================

// Export users and cards data in various formats
exports.exportUsersCardsData = async (req, res) => {
  try {
    console.log('📊 Starting export of users and cards data...');
    
    const { 
      format = 'json',
      search = '', 
      filterBy = 'all',
      timeRange = '30d',
      includeCards = true,
      includeStats = true
    } = req.query;

    // Calculate date threshold
    let dateThreshold;
    switch (timeRange) {
      case '7d':
        dateThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        dateThreshold = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        dateThreshold = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        dateThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const activeUserThreshold = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Build search query
    let searchQuery = {};
    if (search) {
      searchQuery = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Apply filter
    if (filterBy === 'active') {
      searchQuery.lastLogin = { $gte: activeUserThreshold };
    } else if (filterBy === 'inactive') {
      searchQuery.$or = [
        { lastLogin: { $lt: activeUserThreshold } },
        { lastLogin: { $exists: false } }
      ];
    }

    // Get users with extended data for export
    const usersForExport = await User.aggregate([
      { $match: searchQuery },
      {
        $lookup: {
          from: "cards",
          let: { userId: { $toString: "$_id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: [{ $toString: "$userId" }, "$$userId"] }
                  ]
                }
              }
            }
          ],
          as: "userCards"
        }
      },
      {
        $lookup: {
          from: "spaces",
          let: { userId: { $toString: "$_id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$ownerId", "$$userId"] },
                    { $eq: [{ $toString: "$ownerId" }, "$$userId"] }
                  ]
                }
              }
            }
          ],
          as: "ownedSpaces"
        }
      },
      {
        $lookup: {
          from: "connections",
          let: { userId: { $toString: "$_id" } },
          pipeline: [
            {
              $match: {
                $expr: {
                  $or: [
                    { $eq: ["$userId", "$$userId"] },
                    { $eq: [{ $toString: "$userId" }, "$$userId"] }
                  ]
                }
              }
            }
          ],
          as: "userConnections"
        }
      },
      {
        $addFields: {
          cardCount: { $size: "$userCards" },
          spaceCount: { $size: "$ownedSpaces" },
          connectionCount: { $size: "$userConnections" },
          isActive: {
            $cond: {
              if: { 
                $and: [
                  { $ne: ["$lastLogin", null] },
                  { $gte: ["$lastLogin", activeUserThreshold] }
                ]
              },
              then: true,
              else: false
            }
          },
          recentCardsCount: {
            $size: {
              $filter: {
                input: "$userCards",
                cond: { $gte: ["$$this.createdAt", dateThreshold] }
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          email: 1,
          createdAt: 1,
          lastLogin: 1,
          role: 1,
          cardCount: 1,
          spaceCount: 1,
          connectionCount: 1,
          recentCardsCount: 1,
          isActive: 1,
          suspended: { $ifNull: ["$suspended", false] },
          // Include cards if requested
          ...(includeCards === 'true' && {
            cards: {
              $map: {
                input: "$userCards",
                as: "card",
                in: {
                  id: "$$card._id",
                  title: "$$card.title",
                  type: "$$card.type",
                  createdAt: "$$card.createdAt",
                  spaceId: "$$card.spaceId"
                }
              }
            }
          })
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    console.log(`📋 Prepared ${usersForExport.length} users for export`);

    // Get statistics if requested
    let statistics = {};
    if (includeStats === 'true') {
      const [totalCards, totalSpaces, totalConnections] = await Promise.all([
        Card.countDocuments(),
        Space.countDocuments(),
        Connection.countDocuments()
      ]);

      statistics = {
        exportInfo: {
          generatedAt: new Date().toISOString(),
          timeRange,
          filterBy,
          searchTerm: search,
          totalUsersExported: usersForExport.length
        },
        platformStats: {
          totalUsers: usersForExport.length,
          activeUsers: usersForExport.filter(u => u.isActive).length,
          totalCards,
          totalSpaces,
          totalConnections,
          avgCardsPerUser: usersForExport.length > 0 ? 
            Math.round((usersForExport.reduce((sum, u) => sum + u.cardCount, 0) / usersForExport.length) * 100) / 100 : 0
        }
      };
    }

    // Format data based on requested format
    if (format === 'csv') {
      // Convert to CSV format
      const csvHeaders = [
        'ID',
        'Name', 
        'Email',
        'Role',
        'Created Date',
        'Last Login',
        'Card Count',
        'Space Count',
        'Connection Count',
        'Recent Cards',
        'Active Status',
        'Account Status'
      ];

      const csvRows = usersForExport.map(user => [
        user._id.toString(),
        user.name || '',
        user.email || '',
        user.role || 'user',
        user.createdAt ? new Date(user.createdAt).toISOString().split('T')[0] : '',
        user.lastLogin ? new Date(user.lastLogin).toISOString().split('T')[0] : 'Never',
        user.cardCount || 0,
        user.spaceCount || 0,
        user.connectionCount || 0,
        user.recentCardsCount || 0,
        user.isActive ? 'Active' : 'Inactive',
        user.suspended ? 'Suspended' : 'Normal'
      ]);

      const csvContent = [csvHeaders, ...csvRows]
        .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
        .join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="users-cards-export-${Date.now()}.csv"`);
      res.send(csvContent);

    } else {
      // JSON format
      const exportData = {
        ...statistics,
        users: usersForExport
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="users-cards-export-${Date.now()}.json"`);
      res.json(exportData);
    }

    console.log(`✅ Export completed successfully in ${format} format`);

  } catch (error) {
    console.error('💥 Export users cards data error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
};

// Export user data for a specific user
exports.exportUserData = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    console.log(`📋 Exporting data for user: ${id}`);

    // Get user with all related data
    const user = await User.findById(id).select('-password -googleId');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Get user's cards
    const userCards = await Card.find({
      $or: [
        { userId: id },
        { userId: id.toString() }
      ]
    }).select('-__v');

    // Get user's spaces
    const userSpaces = await Space.find({ ownerId: id }).select('-__v');

    // Get user's connections
    const userConnections = await Connection.find({
      $or: [
        { userId: id },
        { userId: id.toString() }
      ]
    }).select('-__v');

    // Get user's AI conversations
    const userAIChats = await AIChatConversation.find({ userId: id })
      .select('-messages.metadata -__v')
      .limit(50); // Limit for performance

    const exportData = {
      exportInfo: {
        userId: id,
        userName: user.name,
        userEmail: user.email,
        generatedAt: new Date().toISOString(),
        dataVersion: '1.0'
      },
      userData: user.toObject(),
      statistics: {
        totalCards: userCards.length,
        totalSpaces: userSpaces.length,
        totalConnections: userConnections.length,
        totalAIConversations: userAIChats.length
      },
      cards: userCards,
      spaces: userSpaces,
      connections: userConnections,
      aiConversations: userAIChats
    };

    if (format === 'csv') {
      // Simple CSV for user data
      const csvContent = [
        'Field,Value',
        `User ID,"${user._id}"`,
        `Name,"${user.name || ''}"`,
        `Email,"${user.email || ''}"`,
        `Role,"${user.role || 'user'}"`,
        `Created,"${user.createdAt}"`,
        `Last Login,"${user.lastLogin || 'Never'}"`,
        `Total Cards,"${userCards.length}"`,
        `Total Spaces,"${userSpaces.length}"`,
        `Total Connections,"${userConnections.length}"`,
        `Total AI Conversations,"${userAIChats.length}"`
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="user-${id}-export-${Date.now()}.csv"`);
      res.send(csvContent);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="user-${id}-export-${Date.now()}.json"`);
      res.json(exportData);
    }

    console.log(`✅ User data export completed for: ${id}`);

  } catch (error) {
    console.error('💥 Export user data error:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message,
      error: process.env.NODE_ENV === 'development' ? error.stack : 'Internal server error'
    });
  }
};

module.exports = exports; 