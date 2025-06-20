const User = require('../models/User');

// Get user navigation preferences
const getUserNavPreferences = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('navCategories navLinks');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Initialize default categories if user has none
    if (!user.navCategories || user.navCategories.length === 0) {
      const defaultCategories = [
        { id: 'stake', name: 'Stake Pages', icon: 'document', isDefault: true },
        { id: 'crypto', name: 'Crypto Explorers', icon: 'link', isDefault: true },
        { id: 'documents', name: 'Documents', icon: 'document', isDefault: true },
        { id: 'excel', name: 'Excel Tables', icon: 'grid', isDefault: true }
      ];
      
      user.navCategories = defaultCategories;
      await user.save();
    }

    res.json({
      categories: user.navCategories || [],
      links: user.navLinks || []
    });
  } catch (error) {
    console.error('Error getting user nav preferences:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update user navigation categories
const updateNavCategories = async (req, res) => {
  try {
    const { categories } = req.body;
    
    if (!Array.isArray(categories)) {
      return res.status(400).json({ message: 'Categories must be an array' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.navCategories = categories;
    await user.save();

    res.json({ message: 'Categories updated successfully', categories: user.navCategories });
  } catch (error) {
    console.error('Error updating nav categories:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Add navigation link
const addNavLink = async (req, res) => {
  try {
    const { categoryId, name, url, action = 'open' } = req.body;
    
    if (!categoryId || !name || !url) {
      return res.status(400).json({ message: 'Category ID, name, and URL are required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const newLink = {
      id: Date.now().toString(),
      categoryId,
      name,
      url,
      action,
      createdAt: new Date()
    };

    user.navLinks.push(newLink);
    await user.save();

    res.json({ message: 'Link added successfully', link: newLink });
  } catch (error) {
    console.error('Error adding nav link:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Update navigation link
const updateNavLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    const { name, url, action, categoryId } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const linkIndex = user.navLinks.findIndex(link => link.id === linkId);
    if (linkIndex === -1) {
      return res.status(404).json({ message: 'Link not found' });
    }

    if (name) user.navLinks[linkIndex].name = name;
    if (url) user.navLinks[linkIndex].url = url;
    if (action) user.navLinks[linkIndex].action = action;
    if (categoryId) user.navLinks[linkIndex].categoryId = categoryId;

    await user.save();

    res.json({ message: 'Link updated successfully', link: user.navLinks[linkIndex] });
  } catch (error) {
    console.error('Error updating nav link:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

// Delete navigation link
const deleteNavLink = async (req, res) => {
  try {
    const { linkId } = req.params;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const linkIndex = user.navLinks.findIndex(link => link.id === linkId);
    if (linkIndex === -1) {
      return res.status(404).json({ message: 'Link not found' });
    }

    user.navLinks.splice(linkIndex, 1);
    await user.save();

    res.json({ message: 'Link deleted successfully' });
  } catch (error) {
    console.error('Error deleting nav link:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  getUserNavPreferences,
  updateNavCategories,
  addNavLink,
  updateNavLink,
  deleteNavLink
}; 