// API Base URL - loaded from config
const API_URL = typeof CONFIG !== 'undefined' ? CONFIG.API_URL : '';

// Global variables
let videoStream = null;
let isScanning = false;
let scanInterval = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    updateDateTime();
    setInterval(updateDateTime, 1000);
    loadTodayStats();
    setInterval(loadTodayStats, 30000);
});

// Date and Time Display
function updateDateTime() {
    const now = new Date();

    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', dateOptions);

    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    document.getElementById('current-time').textContent = now.toLocaleTimeString('en-US', timeOptions);
}

// Load Today's Stats
async function loadTodayStats() {
    try {
        const response = await fetch(`${API_URL}/api/logs/access?limit=1000`);

        if (!response.ok) return;

        const data = await response.json();
        const logs = data.logs || [];

        // Filter today's logs
        const today = new Date().toDateString();
        const todayLogs = logs.filter(log => new Date(log.timestamp).toDateString() === today);

        const granted = todayLogs.filter(log => log.status === 'granted').length;
        const denied = todayLogs.filter(log => log.status === 'denied').length;

        document.getElementById('today-granted').textContent = granted;
        document.getElementById('today-denied').textContent = denied;

        // Update recent access list
        updateRecentAccessList(todayLogs.slice(0, 10));

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

function updateRecentAccessList(logs) {
    const container = document.getElementById('recent-access-list');

    if (!logs || logs.length === 0) {
        container.innerHTML = '<p class="no-data">No recent access attempts</p>';
        return;
    }

    container.innerHTML = logs.map(log => {
        const time = new Date(log.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const name = log.firstName && log.lastName
            ? `${log.firstName} ${log.lastName}`
            : 'Unknown';

        const statusClass = log.status === 'granted' ? 'badge-success' : 'badge-danger';

        return `
            <div class="access-item">
                <div>
                    <strong>${name}</strong>
                    <br>
                    <small>${time}</small>
                </div>
                <span class="badge ${statusClass}">${log.status.toUpperCase()}</span>
            </div>
        `;
    }).join('');
}

// Camera and Scanning
async function startScanning() {
    try {
        // Request camera access
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                facingMode: 'user'
            }
        });

        const video = document.getElementById('scanner-video');
        video.srcObject = videoStream;

        // Update UI
        document.getElementById('start-scan-btn').style.display = 'none';
        document.getElementById('stop-scan-btn').style.display = 'inline-flex';

        isScanning = true;

        // Start automatic scanning every 1 second for fast detection
        scanInterval = setInterval(captureAndVerifyFace, 1000);

        showToast('Scanner started successfully', 'success');

    } catch (error) {
        console.error('Error starting scanner:', error);

        let errorMsg = 'Failed to access camera. ';
        if (error.name === 'NotAllowedError') {
            errorMsg += 'Camera permission denied. Click the camera icon in your browser address bar and allow access.';
        } else if (error.name === 'NotFoundError') {
            errorMsg += 'No camera found on this device.';
        } else if (error.name === 'NotReadableError') {
            errorMsg += 'Camera is already in use by another application.';
        } else {
            errorMsg += 'Please check camera permissions in browser settings.';
        }

        showToast(errorMsg, 'error');

        // Show instructions in result panel
        document.getElementById('verification-result').innerHTML = `
            <div class="result-denied">
                <i class="fas fa-camera-slash" style="font-size: 3rem; margin-bottom: 1rem;"></i>
                <h2 style="color: #ff4444;">Camera Access Required</h2>
                <p style="margin: 1rem 0; color: rgba(255,255,255,0.7);">${errorMsg}</p>
                <div style="text-align: left; margin-top: 1.5rem; padding: 1rem; background: rgba(0,0,0,0.3); border-radius: 8px;">
                    <p style="font-weight: bold; margin-bottom: 0.5rem;">📝 How to enable camera:</p>
                    <ol style="margin-left: 1.5rem; color: rgba(255,255,255,0.7);">
                        <li>Click the camera icon in your browser address bar</li>
                        <li>Select "Always allow" for this site</li>
                        <li>Refresh the page and try again</li>
                    </ol>
                    <p style="margin-top: 1rem; font-size: 0.9rem;">
                        <strong>Note:</strong> Use <code>http://localhost:3001/scanner.html</code> for best compatibility
                    </p>
                </div>
            </div>
        `;
    }
}

function stopScanning() {
    // Stop video stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    // Clear scan interval
    if (scanInterval) {
        clearInterval(scanInterval);
        scanInterval = null;
    }

    isScanning = false;

    // Update UI
    document.getElementById('start-scan-btn').style.display = 'inline-flex';
    document.getElementById('stop-scan-btn').style.display = 'none';

    // Reset result display
    document.getElementById('verification-result').innerHTML = `
        <div class="result-idle">
            <i class="fas fa-user-shield"></i>
            <p>Scanner stopped</p>
            <small>Click "Start Scanner" to begin</small>
        </div>
    `;

    showToast('Scanner stopped', 'info');
}

// Simple single-frame scanning for verification - crops only the circular face area
async function captureAndVerifyFace() {
    if (!isScanning) return;

    const video = document.getElementById('scanner-video');
    const canvas = document.getElementById('scanner-canvas');

    // Get video dimensions
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    if (!videoWidth || !videoHeight) {
        console.warn('Video not ready yet');
        return;
    }

    // Calculate the face frame position (centered circle)
    const videoContainer = document.querySelector('.video-container');
    const containerWidth = videoContainer.offsetWidth;
    const containerHeight = videoContainer.offsetHeight;

    // Face frame is centered and sized relative to container
    const frameSize = Math.min(containerWidth, containerHeight) * 0.6;

    // Map to video coordinates
    const scaleX = videoWidth / containerWidth;
    const scaleY = videoHeight / containerHeight;
    const scale = Math.max(scaleX, scaleY); // Use max to ensure we cover the visible area

    const cropSize = frameSize * scale;
    const cropX = (videoWidth - cropSize) / 2;
    const cropY = (videoHeight - cropSize) / 2;

    // Set canvas to crop size (square for the circle)
    canvas.width = cropSize;
    canvas.height = cropSize;

    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.clearRect(0, 0, cropSize, cropSize);

    // Create circular clipping mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(cropSize / 2, cropSize / 2, cropSize / 2, 0, Math.PI * 2);
    ctx.clip();

    // Draw only the circular region from video
    ctx.drawImage(
        video,
        cropX, cropY, cropSize, cropSize,  // Source rectangle
        0, 0, cropSize, cropSize            // Destination rectangle
    );

    ctx.restore();

    // Convert canvas to base64
    const imageData = canvas.toDataURL('image/jpeg', 0.95);

    // Verify face
    await verifyFace(imageData);
}

async function verifyFace(imageData) {
    try {
        const startTime = Date.now();

        const response = await fetch(`${API_URL}/api/face/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ imageData })
        });

        if (!response.ok) {
            throw new Error('Verification request failed');
        }

        const result = await response.json();
        const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
        result.processingTime = processingTime;

        displayVerificationResult(result);

        // Reload stats after verification
        loadTodayStats();

    } catch (error) {
        console.error('Verification error:', error);
        showToast('Verification failed. Please try again.', 'error');
    }
}

function displayVerificationResult(result) {
    const container = document.getElementById('verification-result');

    if (result.expired) {
        // Membership expired
        playSound('error');

        container.innerHTML = `
            <div class="result-denied">
                <i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i>
                <h2 style="color: #ff9800; margin-bottom: 1rem;">⚠️ MEMBERSHIP EXPIRED</h2>
                <img src="${result.member.photoPath}" alt="${result.member.firstName}" class="member-photo-large" style="opacity: 0.7;">
                <div class="member-info">
                    <h3>${result.member.firstName} ${result.member.lastName}</h3>
                    <p style="color: #ff4444; font-weight: bold; margin-top: 10px;">Please renew your subscription</p>
                    <p style="font-size: 14px; opacity: 0.8;">Expired: ${new Date(result.expiredDate).toLocaleDateString()}</p>
                </div>
            </div>
        `;

        // Reset to idle after 5 seconds
        setTimeout(() => {
            if (isScanning) {
                container.innerHTML = `
                    <div class="result-idle">
                        <i class="fas fa-user-shield"></i>
                        <p>Ready to scan</p>
                        <small>Position your face within the frame</small>
                    </div>
                `;
            }
        }, 5000);

    } else if (result.verified) {
        // Access granted - STOP SCANNING AUTOMATICALLY
        playSound('success');
        stopScanning();

        const expiryWarning = result.membershipDaysLeft && result.membershipDaysLeft <= 7 && result.membershipDaysLeft > 0
            ? `<p style="color: #ff9800; font-weight: bold; margin-top: 5px;">⚠️ Expires in ${result.membershipDaysLeft} day${result.membershipDaysLeft > 1 ? 's' : ''}!</p>`
            : '';

        // Check if partial match (face recognized but not in DB)
        const partialMatchWarning = result.partialMatch
            ? `<p style="color: #ff9800; font-size: 0.9em; margin-top: 8px;">⚠️ Please update your membership record at front desk</p>`
            : '';

        const headerColor = result.partialMatch ? '#ff9800' : '#11998e';
        const headerText = result.partialMatch ? 'FACE RECOGNIZED' : 'ACCESS GRANTED';
        const headerIcon = result.partialMatch ? 'fa-user-check' : 'fa-check-circle';

        container.innerHTML = `
            <div class="result-success">
                <i class="fas ${headerIcon}"></i>
                <h2 style="color: ${headerColor}; margin-bottom: 1rem;">✅ ${headerText}</h2>
                ${result.member.photoPath ? `<img src="${result.member.photoPath}" alt="${result.member.firstName}" class="member-photo-large">` : ''}
                <div class="member-info">
                    <h3>${result.member.firstName} ${result.member.lastName}</h3>
                    <p>Membership: <span class="badge badge-primary">${result.member.membershipType || 'Standard'}</span></p>
                    <p style="color: rgba(255,255,255,0.7);">Confidence: ${result.confidence}%</p>
                    ${expiryWarning}
                    ${partialMatchWarning}
                    ${result.processingTime ? `<p style="color: rgba(255,255,255,0.6); font-size: 0.85em;">⚡ ${result.processingTime}s</p>` : ''}
                    <p style="color: #11998e; font-weight: bold; margin-top: 15px;">✓ Scanner stopped automatically</p>
                </div>
            </div>
        `;

        // Show button to scan again
        showToast('Access granted! Scanner stopped.', 'success');

    } else {
        // Access denied
        playSound('error');

        // Format multi-line messages
        const messageLines = (result.message || 'Face not recognized').split('\n');
        const formattedMessage = messageLines.map(line =>
            `<p style="color: rgba(255,255,255,0.8); margin: 0.5rem 0;">${line}</p>`
        ).join('');

        // Show error details if available
        const errorDetails = result.error
            ? `<p style="color: #ff6b6b; font-size: 0.85em; margin-top: 1rem; padding: 0.5rem; background: rgba(255,0,0,0.1); border-radius: 4px;">
                 <i class="fas fa-info-circle"></i> ${result.error}
               </p>`
            : '';

        // Show confidence if available (for near-misses)
        const confidenceInfo = result.confidence
            ? `<p style="color: rgba(255,255,255,0.5); font-size: 0.8em;">Match score: ${(result.confidence * 100).toFixed(1)}%</p>`
            : '';

        container.innerHTML = `
            <div class="result-denied">
                <i class="fas fa-times-circle"></i>
                <h2 style="color: #ee0979; margin-bottom: 1rem;">ACCESS DENIED</h2>
                <div style="margin-top: 1rem;">
                    ${formattedMessage}
                    ${errorDetails}
                    ${confidenceInfo}
                </div>
                ${result.processingTime ? `<p style="color: rgba(255,255,255,0.4); font-size: 0.75em; margin-top: 1rem;">⚡ ${result.processingTime}s</p>` : ''}
            </div>
        `;

        // Reset to idle after 5 seconds for long messages
        const resetTime = messageLines.length > 2 ? 8000 : 3000;
        setTimeout(() => {
            if (isScanning) {
                container.innerHTML = `
                    <div class="result-idle">
                        <i class="fas fa-user-shield"></i>
                        <p>Ready to scan</p>
                        <small>Position your face within the frame</small>
                    </div>
                `;
            }
        }, resetTime);
    }
}

// Sound Effects
function playSound(type) {
    const audio = document.getElementById(`${type}-sound`);
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.log('Audio play failed:', e));
    }
}

// Toast Notifications
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} show`;

    setTimeout(() => {
        toast.className = 'toast';
    }, 3000);
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    stopScanning();
});
