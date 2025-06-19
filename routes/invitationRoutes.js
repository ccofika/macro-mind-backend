const express = require('express');
const router = express.Router();
const Invitation = require('../models/Invitation');
const Space = require('../models/Space');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/authMiddleware');

// Get all invitations for the current user (both sent and received)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userEmail = req.user.email;

    // Get received invitations
    const receivedInvitations = await Invitation.find({
      inviteeEmail: userEmail.toLowerCase(),
      status: 'pending',
      expiresAt: { $gt: new Date() }
    }).populate([
      {
        path: 'space',
        select: 'name description isPublic'
      },
      {
        path: 'inviter',
        select: 'name email'
      }
    ]);

    // Get sent invitations
    const sentInvitations = await Invitation.find({
      inviterUserId: userId.toString()
    }).populate([
      {
        path: 'space',
        select: 'name description isPublic'
      },
      {
        path: 'invitee',
        select: 'name email'
      }
    ]);

    res.json({
      received: receivedInvitations,
      sent: sentInvitations
    });
  } catch (error) {
    console.error('Error getting invitations:', error);
    res.status(500).json({ message: 'Failed to get invitations' });
  }
});

// Send an invitation to join a space
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { spaceId, inviteeEmail, role, message } = req.body;
    const inviterUserId = req.user.id;

    // Validate required fields
    if (!spaceId || !inviteeEmail || !role) {
      return res.status(400).json({ 
        message: 'Space ID, invitee email, and role are required' 
      });
    }

    // Validate role
    if (!['editor', 'viewer'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Must be "editor" or "viewer"' 
      });
    }

    // Check if space exists
    const space = await Space.findById(spaceId);
    if (!space) {
      return res.status(404).json({ message: 'Space not found' });
    }

    // Check if user is the owner of the space
    if (!space.isOwner(inviterUserId)) {
      return res.status(403).json({ 
        message: 'You do not have permission to invite users to this space' 
      });
    }

    // Normalize email
    const normalizedEmail = inviteeEmail.toLowerCase().trim();

    // Check if the invitee is already a member
    const inviteeUser = await User.findOne({ email: normalizedEmail });
    if (inviteeUser && space.members.some(member => member.userId === inviteeUser._id.toString())) {
      return res.status(400).json({ 
        message: 'User is already a member of this space' 
      });
    }

    // Check if there's already a pending invitation
    const existingInvitation = await Invitation.findBySpaceAndEmail(spaceId, normalizedEmail);
    if (existingInvitation) {
      return res.status(400).json({ 
        message: 'An invitation to this space is already pending for this user' 
      });
    }

    // Create the invitation
    const invitation = new Invitation({
      spaceId,
      inviterUserId: inviterUserId.toString(),
      inviteeEmail: normalizedEmail,
      inviteeUserId: inviteeUser ? inviteeUser._id.toString() : undefined,
      role,
      message: message || ''
    });

    await invitation.save();

    // Populate the invitation for response
    await invitation.populate([
      {
        path: 'space',
        select: 'name description isPublic'
      },
      {
        path: 'inviter',
        select: 'name email'
      }
    ]);

    console.log(`Invitation sent: ${invitation.inviter.name} invited ${normalizedEmail} to ${invitation.space.name}`);

    res.status(201).json(invitation);
  } catch (error) {
    console.error('Error sending invitation:', error);
    if (error.code === 11000) {
      res.status(400).json({ 
        message: 'An invitation to this space is already pending for this user' 
      });
    } else {
      res.status(500).json({ message: 'Failed to send invitation' });
    }
  }
});

// Accept an invitation
router.post('/:invitationId/accept', authenticateToken, async (req, res) => {
  try {
    const invitationId = req.params.invitationId;
    const userId = req.user.id;
    const userEmail = req.user.email;

    const invitation = await Invitation.findById(invitationId).populate('space');

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Check if the invitation is for this user
    if (invitation.inviteeEmail !== userEmail.toLowerCase()) {
      return res.status(403).json({ 
        message: 'You are not authorized to accept this invitation' 
      });
    }

    // Check if invitation is still valid
    if (!invitation.isValid()) {
      return res.status(400).json({ 
        message: 'This invitation has expired or has already been responded to' 
      });
    }

    // Check if space still exists
    if (!invitation.space) {
      return res.status(404).json({ message: 'The space for this invitation no longer exists' });
    }

    // Check if user is already a member (race condition protection)
    if (invitation.space.members.some(member => member.userId === userId.toString())) {
      await invitation.accept();
      return res.json({ 
        message: 'You are already a member of this space',
        space: invitation.space
      });
    }

    // Add user to space members
    invitation.space.addMember(userId.toString(), invitation.role);
    await invitation.space.save();

    // Update invitation status
    invitation.inviteeUserId = userId.toString();
    await invitation.accept();

    console.log(`Invitation accepted: ${userEmail} joined space ${invitation.space.name} as ${invitation.role}`);

    res.json({
      message: 'Invitation accepted successfully',
      space: invitation.space,
      role: invitation.role
    });
  } catch (error) {
    console.error('Error accepting invitation:', error);
    res.status(500).json({ message: 'Failed to accept invitation' });
  }
});

// Reject an invitation
router.post('/:invitationId/reject', authenticateToken, async (req, res) => {
  try {
    const invitationId = req.params.invitationId;
    const userEmail = req.user.email;

    const invitation = await Invitation.findById(invitationId);

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Check if the invitation is for this user
    if (invitation.inviteeEmail !== userEmail.toLowerCase()) {
      return res.status(403).json({ 
        message: 'You are not authorized to reject this invitation' 
      });
    }

    // Check if invitation is still valid
    if (invitation.status !== 'pending') {
      return res.status(400).json({ 
        message: 'This invitation has already been responded to' 
      });
    }

    // Reject the invitation
    await invitation.reject();

    console.log(`Invitation rejected: ${userEmail} rejected invitation to space ID ${invitation.spaceId}`);

    res.json({ message: 'Invitation rejected successfully' });
  } catch (error) {
    console.error('Error rejecting invitation:', error);
    res.status(500).json({ message: 'Failed to reject invitation' });
  }
});

// Cancel an invitation (for space owners)
router.delete('/:invitationId', authenticateToken, async (req, res) => {
  try {
    const invitationId = req.params.invitationId;
    const userId = req.user.id;

    const invitation = await Invitation.findById(invitationId).populate('space');

    if (!invitation) {
      return res.status(404).json({ message: 'Invitation not found' });
    }

    // Check if user is the inviter or space owner
    const isInviter = invitation.inviterUserId === userId.toString();
    const isSpaceOwner = invitation.space && invitation.space.isOwner(userId);

    if (!isInviter && !isSpaceOwner) {
      return res.status(403).json({ 
        message: 'You do not have permission to cancel this invitation' 
      });
    }

    await Invitation.findByIdAndDelete(invitationId);

    console.log(`Invitation cancelled: Invitation to ${invitation.inviteeEmail} for space ID ${invitation.spaceId}`);

    res.json({ message: 'Invitation cancelled successfully' });
  } catch (error) {
    console.error('Error cancelling invitation:', error);
    res.status(500).json({ message: 'Failed to cancel invitation' });
  }
});

// Get invitations for a specific space (for space owners)
router.get('/space/:spaceId', authenticateToken, async (req, res) => {
  try {
    const spaceId = req.params.spaceId;
    const userId = req.user.id;

    const space = await Space.findById(spaceId);
    if (!space) {
      return res.status(404).json({ message: 'Space not found' });
    }

    // Check if user is the owner of the space
    if (!space.isOwner(userId)) {
      return res.status(403).json({ 
        message: 'You do not have permission to view invitations for this space' 
      });
    }

    const invitations = await Invitation.find({
      spaceId: spaceId
    }).populate([
      {
        path: 'inviter',
        select: 'name email'
      },
      {
        path: 'invitee',
        select: 'name email'
      }
    ]).sort({ createdAt: -1 });

    res.json(invitations);
  } catch (error) {
    console.error('Error getting space invitations:', error);
    res.status(500).json({ message: 'Failed to get space invitations' });
  }
});

module.exports = router; 