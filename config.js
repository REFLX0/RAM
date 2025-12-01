// Configuration for frontend
// Change this URL to your deployed backend URL
const CONFIG = {
    // For local development
    // API_URL: 'http://localhost:5000'
    
    // For production (update with your Render/Railway URL)
    API_URL: 'https://your-backend-app.onrender.com'
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
