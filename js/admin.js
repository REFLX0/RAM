// API Base URL - loaded from config
const API_URL = typeof CONFIG !== 'undefined' ? CONFIG.API_URL : '';

// Authentication
const token = localStorage.getItem('authToken');

// Check authentication
if (!token) {
    window.location.href = 'index.html';
}

// Global variables
let videoStream = null;
let capturedImageData = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    verifyAuth();
    loadDashboardData();
    loadMembers(); // Pre-load members for faster display

    // Set up event listeners
    document.getElementById('register-form').addEventListener('submit', handleRegisterSubmit);
    document.getElementById('search-members').addEventListener('input', handleSearchMembers);

    // Auto-refresh stats every 30 seconds
    setInterval(loadDashboardData, 30000);
});

// Authentication
async function verifyAuth() {
    try {
        const response = await fetch(`${API_URL}/api/auth/verify`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            logout();
        }
    } catch (error) {
        console.error('Auth verification error:', error);
        logout();
    }
}

function logout() {
    localStorage.removeItem('authToken');
    window.location.href = 'index.html';
}

// Navigation
function showSection(sectionName) {
    // Hide all sections
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });

    // Remove active class from all nav items
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    // Show selected section
    document.getElementById(`${sectionName}-section`).classList.add('active');

    // Add active class to nav item
    event.target.closest('.nav-item').classList.add('active');

    // Update page title
    const titles = {
        'dashboard': 'Dashboard Overview',
        'members': 'Member Management',
        'register': 'Register New Member',
        'access-logs': 'Access Logs'
    };
    document.getElementById('page-title').textContent = titles[sectionName] || 'Dashboard';

    // Load section data
    if (sectionName === 'dashboard') {
        loadDashboardData();
    } else if (sectionName === 'members') {
        loadMembers();
    } else if (sectionName === 'access-logs') {
        loadAccessLogs();
    }
}

// Dashboard Data
async function loadDashboardData() {
    try {
        const response = await fetch(`${API_URL}/api/stats/dashboard`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to load dashboard data');

        const data = await response.json();

        // Update stats
        document.getElementById('total-members').textContent = data.totalMembers;
        document.getElementById('today-access').textContent = data.todayAccess;
        document.getElementById('today-denied').textContent = data.todayDenied;

        // Calculate success rate
        const total = data.todayAccess + data.todayDenied;
        const successRate = total > 0 ? ((data.todayAccess / total) * 100).toFixed(1) : 0;
        document.getElementById('success-rate').textContent = `${successRate}%`;

        // Display recent members
        displayRecentMembers(data.recentMembers);

    } catch (error) {
        console.error('Error loading dashboard data:', error);
        showToast('Failed to load dashboard data', 'error');
    }
}

function displayRecentMembers(members) {
    const container = document.getElementById('recent-members');

    if (!members || members.length === 0) {
        container.innerHTML = '<p class="no-data">No recent members</p>';
        return;
    }

    container.innerHTML = members.map(member => `
        <div class="access-item">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <img src="${member.photoPath}" alt="${member.firstName}" class="member-photo">
                <div>
                    <strong>${member.firstName} ${member.lastName}</strong>
                    <br>
                    <small style="color: var(--text-secondary);">${member.email}</small>
                </div>
            </div>
            <span class="badge badge-primary">${member.membershipType}</span>
        </div>
    `).join('');
}

// Members Management
async function loadMembers() {
    try {
        const response = await fetch(`${API_URL}/api/members`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to load members');

        const data = await response.json();
        displayMembers(data.members);

    } catch (error) {
        console.error('Error loading members:', error);
        showToast('Failed to load members', 'error');
    }
}

function displayMembers(members) {
    const tbody = document.getElementById('members-tbody');

    if (!members || members.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="no-data">No members found</td></tr>';
        return;
    }

    tbody.innerHTML = members.map(member => `
        <tr>
            <td><img src="${member.photoPath}" alt="${member.firstName}" class="member-photo"></td>
            <td>${member.firstName} ${member.lastName}</td>
            <td>${member.email}</td>
            <td>${member.phone || 'N/A'}</td>
            <td><span class="badge badge-primary">${member.membershipType}</span></td>
            <td>${member.lastAccess ? new Date(member.lastAccess).toLocaleString() : 'Never'}</td>
            <td>
                <button class="btn btn-danger delete-member-btn" data-member-id="${member.id}" data-member-name="${member.firstName} ${member.lastName}">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');

    // Attach event listeners to delete buttons
    document.querySelectorAll('.delete-member-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const memberId = this.getAttribute('data-member-id');
            const memberName = this.getAttribute('data-member-name');
            deleteMember(parseInt(memberId), memberName);
        });
    });
}

function handleSearchMembers(e) {
    const searchTerm = e.target.value.toLowerCase();
    const rows = document.querySelectorAll('#members-tbody tr');

    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

async function deleteMember(id, name) {
    if (!confirm(`Are you sure you want to delete ${name}?`)) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/members/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to delete member');

        showToast('Member deleted successfully', 'success');
        loadMembers();
        loadDashboardData();

    } catch (error) {
        console.error('Error deleting member:', error);
        showToast('Failed to delete member', 'error');
    }
}

// Member Registration - Multi-Angle Capture
let capturedAngles = [];
let isCapturing = false;
const captureAngles = [
    { id: 'center', name: 'Center' },
    { id: 'left', name: 'Left' },
    { id: 'right', name: 'Right' },
    { id: 'up', name: 'Up' },
    { id: 'down', name: 'Down' }
];

async function startCamera() {
    try {
        // Request camera with proper constraints
        const constraints = {
            video: {
                width: { ideal: 1280, min: 640 },
                height: { ideal: 720, min: 480 },
                facingMode: 'user'
            },
            audio: false
        };

        console.log('Requesting camera access...');
        videoStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Camera access granted!');

        const video = document.getElementById('register-video');
        video.srcObject = videoStream;
        video.style.display = 'block';

        // Wait for video to be ready
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        document.getElementById('capture-btn').style.display = 'inline-flex';
        document.querySelector('[onclick="startCamera()"]').style.display = 'none';
        document.getElementById('face-guide').style.display = 'block';

        showToast('Camera ready! Position your face in the oval guide', 'success');

    } catch (error) {
        console.error('Camera error:', error);

        let errorMessage = 'Failed to access camera. ';

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
            errorMessage += 'Please allow camera permission in your browser settings.';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
            errorMessage += 'No camera found on your device.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
            errorMessage += 'Camera is being used by another application.';
        } else if (error.name === 'OverconstrainedError') {
            errorMessage += 'Camera does not support the required constraints.';
        } else if (error.name === 'SecurityError') {
            errorMessage += 'Camera access is blocked. Make sure you are using HTTPS or localhost.';
        } else {
            errorMessage += error.message;
        }

        showToast(errorMessage, 'error');

        // Show detailed instructions
        alert(errorMessage + '\n\nTo fix:\n1. Click the lock/info icon in your browser address bar\n2. Allow camera access\n3. Refresh the page and try again');
    }
}

async function capturePhoto() {
    if (isCapturing) return;

    isCapturing = true;
    capturedAngles = [];

    const captureBtn = document.getElementById('capture-btn');
    const originalText = captureBtn.innerHTML;
    captureBtn.disabled = true;

    const instructions = {
        'center': '📸 Look DIRECTLY at the camera',
        'left': '👈 SLOWLY turn your head LEFT (30°)',
        'right': '👉 SLOWLY turn your head RIGHT (30°)',
        'up': '👆 GENTLY tilt your chin UP',
        'down': '👇 GENTLY tilt your chin DOWN'
    };

    const instructionEl = document.getElementById('angle-instruction');
    const faceGuide = document.getElementById('face-guide');
    instructionEl.style.display = 'block';

    // Capture all 5 angles with countdown and user guidance
    for (let i = 0; i < captureAngles.length; i++) {
        const angle = captureAngles[i];

        // Show instruction overlay
        instructionEl.textContent = instructions[angle.id];
        instructionEl.style.background = 'rgba(59, 130, 246, 0.9)';
        instructionEl.style.fontSize = '20px';
        showToast(instructions[angle.id], 'info');
        captureBtn.innerHTML = `<i class="fas fa-camera"></i> ${instructions[angle.id]}`;

        // Change face guide color for each angle
        if (angle.id === 'center') faceGuide.style.borderColor = '#10b981';
        else if (angle.id === 'left') faceGuide.style.borderColor = '#3b82f6';
        else if (angle.id === 'right') faceGuide.style.borderColor = '#f59e0b';
        else if (angle.id === 'up') faceGuide.style.borderColor = '#8b5cf6';
        else if (angle.id === 'down') faceGuide.style.borderColor = '#ec4899';

        // Countdown from 3 to 1
        for (let countdown = 3; countdown >= 1; countdown--) {
            instructionEl.textContent = `${instructions[angle.id]} - ${countdown}`;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        instructionEl.textContent = `${instructions[angle.id]} - SMILE! 📸`;
        await new Promise(resolve => setTimeout(resolve, 300));

        // Capture the angle
        const imageData = captureAngleImage();

        // Verify image quality
        if (!imageData || imageData.length < 1000) {
            showToast(`⚠️ Poor quality, retaking ${angle.name}...`, 'warning');
            i--; // Retry this angle
            continue;
        }

        capturedAngles.push({ angle: angle.id, data: imageData });

        // Flash effect and confirmation
        instructionEl.style.background = 'rgba(16, 185, 129, 0.9)';
        instructionEl.textContent = `✅ PERFECT! ${angle.name} captured!`;
        captureBtn.style.background = '#10b981';
        faceGuide.style.borderColor = '#10b981';
        faceGuide.style.borderWidth = '5px';
        showToast(`✅ ${angle.name} captured perfectly!`, 'success');

        // Brief pause before next angle
        await new Promise(resolve => setTimeout(resolve, 800));
        captureBtn.style.background = '';
        faceGuide.style.borderWidth = '3px';
    }

    // Hide instruction overlay
    instructionEl.textContent = '✅ All angles captured successfully!';
    instructionEl.style.background = 'rgba(16, 185, 129, 0.95)';
    instructionEl.style.fontSize = '22px';
    await new Promise(resolve => setTimeout(resolve, 1500));
    instructionEl.style.display = 'none';
    document.getElementById('face-guide').style.display = 'none';

    // Show preview of first (center) image
    const video = document.getElementById('register-video');
    const preview = document.getElementById('register-preview');

    capturedImageData = capturedAngles[0].data; // Use center image as main photo
    preview.src = capturedImageData;
    preview.style.display = 'block';
    video.style.display = 'none';

    captureBtn.style.display = 'none';
    document.getElementById('retake-btn').style.display = 'inline-flex';

    // Stop video stream
    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
    }

    isCapturing = false;
    captureBtn.innerHTML = originalText;
    captureBtn.disabled = false;
    showToast(`All ${capturedAngles.length} angles captured successfully!`, 'success');
}

function captureAngleImage() {
    const video = document.getElementById('register-video');
    const canvas = document.getElementById('register-canvas');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.9);
}

function retakePhoto() {
    const video = document.getElementById('register-video');
    const preview = document.getElementById('register-preview');

    preview.style.display = 'none';
    capturedImageData = null;

    document.getElementById('retake-btn').style.display = 'none';

    startCamera();
}

async function handleRegisterSubmit(e) {
    e.preventDefault();

    console.log('Register form submitted');

    if (!capturedAngles || capturedAngles.length < 5) {
        showToast('Please capture all 5 photos first', 'error');
        return;
    }

    // Show loading state
    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering...';

    const formData = new FormData();
    formData.append('firstName', document.getElementById('firstName').value);
    formData.append('lastName', document.getElementById('lastName').value);
    formData.append('email', document.getElementById('email').value);
    formData.append('phone', document.getElementById('phone').value);
    formData.append('membershipType', document.getElementById('membershipType').value);
    formData.append('membershipDuration', document.getElementById('membershipDuration').value);
    formData.append('membershipPrice', document.getElementById('membershipPrice').value);

    // Append captured photos
    for (const img of capturedAngles) {
        // Convert base64 to blob
        const res = await fetch(img.data);
        const blob = await res.blob();
        formData.append(img.angle, blob, `${img.angle}.jpg`);
    }

    try {
        console.log('=== REGISTRATION START ===');
        console.log(`Sending registration request with ${capturedAngles.length} photos...`);

        const response = await fetch(`${API_URL}/api/members/register`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData
        });

        console.log('Response status:', response.status);

        // Get response text first to debug
        const responseText = await response.text();
        console.log('Raw response:', responseText);

        // Try to parse as JSON
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            console.error('Response text:', responseText);
            throw new Error('Server returned invalid response. Please check server logs.');
        }

        console.log('Response data:', data);

        if (!response.ok) {
            console.error('Registration failed:', data);
            throw new Error(data.error || data.message || 'Registration failed');
        }

        const memberId = data.memberId;
        console.log('Member registered successfully! ID:', memberId);

        showToast('Member registered successfully! Training pipeline started.', 'success');
        resetRegisterForm();
        loadDashboardData();

        // Show training status if available
        if (data.trainingStatus) {
            setTimeout(() => {
                showToast(data.trainingStatus, 'info');
            }, 2000);
        }

    } catch (error) {
        console.error('=== REGISTRATION ERROR ===');
        console.error('Error details:', error);
        showToast(error.message || 'Failed to register member', 'error');
    } finally {
        // Restore button state
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnText;
        }
    }
}

function resetRegisterForm() {
    document.getElementById('register-form').reset();

    const video = document.getElementById('register-video');
    const preview = document.getElementById('register-preview');

    video.style.display = 'none';
    preview.style.display = 'none';

    if (videoStream) {
        videoStream.getTracks().forEach(track => track.stop());
        videoStream = null;
    }

    capturedImageData = null;
    capturedAngles = [];
    isCapturing = false;

    document.getElementById('capture-btn').style.display = 'none';
    document.getElementById('retake-btn').style.display = 'none';
    document.querySelector('[onclick="startCamera()"]').style.display = 'inline-flex';
}

// Access Logs
async function loadAccessLogs() {
    try {
        const response = await fetch(`${API_URL}/api/logs/access?limit=100`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) throw new Error('Failed to load access logs');

        const logs = await response.json();
        displayAccessLogs(logs);

    } catch (error) {
        console.error('Error loading access logs:', error);
        showToast('Failed to load access logs', 'error');
    }
}

function displayAccessLogs(logs) {
    const tbody = document.getElementById('logs-tbody');

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="no-data">No access logs found</td></tr>';
        return;
    }

    tbody.innerHTML = logs.map(log => `
        <tr>
            <td>${new Date(log.timestamp).toLocaleString()}</td>
            <td>
                ${log.firstName && log.lastName
            ? `${log.firstName} ${log.lastName}`
            : '<em>Unknown</em>'}
            </td>
            <td>
                <span class="badge ${log.status === 'granted' ? 'badge-success' : 'badge-danger'}">
                    ${log.status.toUpperCase()}
                </span>
            </td>
            <td>${log.message}</td>
        </tr>
    `).join('');
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
