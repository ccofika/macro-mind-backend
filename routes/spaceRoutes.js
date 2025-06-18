const express = require('express');
const router = express.Router();
const Space = require('../models/Space');
const { authenticateToken } = require('../middleware/authMiddleware');
const User = require('../models/User');

// Get all spaces where the user is a member
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find spaces where user is owner or member
    const userIdStr = userId.toString();
    const spaces = await Space.find({
      $or: [
        { ownerId: userIdStr },
        { 'members.userId': userIdStr }
      ]
    });
    
    // Also add the public space
    const publicSpace = {
      _id: 'public',
      name: 'Public Space',
      description: 'Default public space for all users',
      isPublic: true,
      ownerId: 'system',
      members: []
    };
    
    res.json([publicSpace, ...spaces]);
  } catch (error) {
    console.error('Error getting spaces:', error);
    res.status(500).json({ message: 'Failed to get spaces' });
  }
});

// Get a specific space by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const spaceId = req.params.id;
    const userId = req.user.id;
    
    console.log(`Getting space ${spaceId} for user ${userId}`);
    
    // Handle public space
    if (spaceId === 'public') {
      return res.json({
        _id: 'public',
        name: 'Public Space',
        description: 'Default public space for all users',
        isPublic: true,
        ownerId: 'system',
        members: []
      });
    }
    
    const space = await Space.findById(spaceId);
    
    if (!space) {
      console.log(`Space ${spaceId} not found`);
      return res.status(404).json({ message: 'Space not found' });
    }
    
    // Use helper method for access check
    if (!space.hasAccess(userId)) {
      console.log(`User ${userId} denied access to space ${spaceId}`);
      console.log(`Space isPublic: ${space.isPublic}, ownerId: ${space.ownerId}, members:`, space.members);
      return res.status(403).json({ message: 'You do not have permission to access this space' });
    }
    
    console.log(`User ${userId} granted access to space ${spaceId}`);
    res.json(space);
  } catch (error) {
    console.error('Error getting space:', error);
    res.status(500).json({ message: 'Failed to get space' });
  }
});

// Create a new space
router.post('/', authenticateToken, async (req, res) => {
  try {
    console.log('Creating space with data:', req.body);
    console.log('User ID:', req.user.id);
    
    const { name, description, isPublic } = req.body;
    const userId = req.user.id;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required and must be a string' });
    }
    
    const space = new Space({
      name,
      description: description || '',
      ownerId: userId.toString(),
      isPublic: isPublic || false
    });
    
    console.log('Space object before save:', space);
    
    await space.save();
    
    console.log('Space created successfully:', space);
    
    res.status(201).json(space);
  } catch (error) {
    console.error('Error creating space:', error);
    res.status(500).json({ message: 'Failed to create space' });
  }
});

// Update a space
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const spaceId = req.params.id;
    const userId = req.user.id;
    const { name, description, isPublic } = req.body;
    
    const space = await Space.findById(spaceId);
    
    if (!space) {
      return res.status(404).json({ message: 'Space not found' });
    }
    
    // Check if user is the owner of the space
    if (!space.isOwner(userId)) {
      return res.status(403).json({ message: 'You do not have permission to update this space' });
    }
    
    // Update space properties
    if (name) space.name = name;
    if (description !== undefined) space.description = description;
    if (isPublic !== undefined) space.isPublic = isPublic;
    
    await space.save();
    
    res.json(space);
  } catch (error) {
    console.error('Error updating space:', error);
    res.status(500).json({ message: 'Failed to update space' });
  }
});

// Delete a space
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const spaceId = req.params.id;
    const userId = req.user.id;
    
    const space = await Space.findById(spaceId);
    
    if (!space) {
      return res.status(404).json({ message: 'Space not found' });
    }
    
    // Check if user is the owner of the space
    if (space.ownerId !== userId.toString()) {
      return res.status(403).json({ message: 'You do not have permission to delete this space' });
    }
    
    await Space.findByIdAndDelete(spaceId);
    
    res.json({ message: 'Space deleted successfully' });
  } catch (error) {
    console.error('Error deleting space:', error);
    res.status(500).json({ message: 'Failed to delete space' });
  }
});

// Add a member to a space
router.post('/:id/members', authenticateToken, async (req, res) => {
  try {
    const spaceId = req.params.id;
    const userId = req.user.id;
    const { memberEmail, role } = req.body;
    
    if (!memberEmail || !role) {
      return res.status(400).json({ message: 'Member email and role are required' });
    }
    
    // Validate role
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be "editor" or "viewer"' });
    }
    
    const space = await Space.findById(spaceId);
    
    if (!space) {
      return res.status(404).json({ message: 'Space not found' });
    }
    
    // Check if user is the owner of the space
    if (!space.isOwner(userId)) {
      return res.status(403).json({ message: 'You do not have permission to add members to this space' });
    }
    
    // Find the user by email
    const memberUser = await User.findOne({ email: memberEmail.toLowerCase() });
    
    if (!memberUser) {
      return res.status(404).json({ message: 'User not found with this email' });
    }
    
    const memberUserId = memberUser._id.toString();
    
    // Use helper method to add member
    space.addMember(memberUserId, role);
    
    await space.save();
    
    res.json(space);
  } catch (error) {
    console.error('Error adding member to space:', error);
    res.status(500).json({ message: 'Failed to add member to space' });
  }
});

// Remove a member from a space
router.delete('/:id/members/:memberId', authenticateToken, async (req, res) => {
  try {
    const spaceId = req.params.id;
    const userId = req.user.id;
    const memberIdToRemove = req.params.memberId;
    
    const space = await Space.findById(spaceId);
    
    if (!space) {
      return res.status(404).json({ message: 'Space not found' });
    }
    
    // Check if user is the owner of the space or the member being removed
    const userIdStr = userId.toString();
    if (space.ownerId !== userIdStr && userIdStr !== memberIdToRemove) {
      return res.status(403).json({ message: 'You do not have permission to remove this member' });
    }
    
    // Cannot remove the owner
    if (memberIdToRemove === space.ownerId) {
      return res.status(400).json({ message: 'Cannot remove the owner of the space' });
    }
    
    // Remove the member
    space.members = space.members.filter(member => member.userId !== memberIdToRemove);
    
    await space.save();
    
    res.json(space);
  } catch (error) {
    console.error('Error removing member from space:', error);
    res.status(500).json({ message: 'Failed to remove member from space' });
  }
});

// Update a member's role in a space
router.put('/:id/members/:memberId', authenticateToken, async (req, res) => {
  try {
    const spaceId = req.params.id;
    const userId = req.user.id;
    const memberIdToUpdate = req.params.memberId;
    const { role } = req.body;
    
    if (!role) {
      return res.status(400).json({ message: 'Role is required' });
    }
    
    // Validate role
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role. Must be "editor" or "viewer"' });
    }
    
    const space = await Space.findById(spaceId);
    
    if (!space) {
      return res.status(404).json({ message: 'Space not found' });
    }
    
    // Check if user is the owner of the space
    if (space.ownerId !== userId.toString()) {
      return res.status(403).json({ message: 'You do not have permission to update member roles' });
    }
    
    // Cannot update the owner's role
    if (memberIdToUpdate === space.ownerId) {
      return res.status(400).json({ message: 'Cannot update the role of the owner' });
    }
    
    // Find and update the member
    const memberIndex = space.members.findIndex(member => member.userId === memberIdToUpdate);
    
    if (memberIndex === -1) {
      return res.status(404).json({ message: 'Member not found in this space' });
    }
    
    space.members[memberIndex].role = role;
    
    await space.save();
    
    res.json(space);
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ message: 'Failed to update member role' });
  }
});

module.exports = router; 