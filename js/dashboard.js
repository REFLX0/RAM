/**
 * Example Dashboard Integration with Supabase
 * This shows how to use the Supabase client in your admin dashboard
 */

import { supabase, getCurrentUser, isAdmin } from './config/supabase.js';
import {
    getDashboardStats,
    getActiveMembers,
    getTodayVisits,
    getExpiringMemberships,
    subscribeToVisits,
    subscribeToPayments,
    recordVisit,
    registerMember,
    renewSubscription
} from './database/supabaseClient.js';

class AdminDashboard {
    constructor() {
        this.channels = [];
        this.currentUser = null;
    }

    /**
     * Initialize the dashboard
     */
    async init() {
        // Check authentication
        const user = await getCurrentUser();
        if (!user) {
            console.log('User not logged in, redirecting to login...');
            // window.location.href = '/login.html';
            return;
        }

        // Check if user is admin
        const adminCheck = await isAdmin();
        if (!adminCheck) {
            console.error('User is not an admin!');
            alert('Access denied: Admin privileges required');
            return;
        }

        this.currentUser = user;
        console.log('Admin logged in:', user.email);

        // Load dashboard data
        await this.loadDashboard();

        // Set up realtime subscriptions
        this.setupRealtimeSubscriptions();
    }

    /**
     * Load all dashboard data
     */
    async loadDashboard() {
        console.log('Loading dashboard data...');

        // Get statistics
        const stats = await getDashboardStats();
        this.updateStatsUI(stats);

        // Get today's visits
        const visits = await getTodayVisits();
        this.updateVisitsUI(visits);

        // Get expiring memberships
        const expiring = await getExpiringMemberships();
        this.updateExpiringUI(expiring);

        // Get active members
        const members = await getActiveMembers();
        this.updateMembersUI(members);

        console.log('Dashboard loaded successfully');
    }

    /**
     * Update statistics UI
     */
    updateStatsUI(stats) {
        console.log('Dashboard Stats:', stats);

        // Update your HTML elements here
        const todayVisitsEl = document.getElementById('today-visits');
        const activeMembersEl = document.getElementById('active-members');
        const expiringSoonEl = document.getElementById('expiring-soon');
        const todayRevenueEl = document.getElementById('today-revenue');

        if (todayVisitsEl) todayVisitsEl.textContent = stats.todayVisits;
        if (activeMembersEl) activeMembersEl.textContent = stats.activeMembers;
        if (expiringSoonEl) expiringSoonEl.textContent = stats.expiringSoon;
        if (todayRevenueEl) todayRevenueEl.textContent = `$${stats.todayRevenue}`;
    }

    /**
     * Update visits list UI
     */
    updateVisitsUI(visits) {
        console.log('Today\'s Visits:', visits);

        const container = document.getElementById('visits-list');
        if (!container) return;

        if (visits.length === 0) {
            container.innerHTML = '<p>No visits today</p>';
            return;
        }

        container.innerHTML = visits.map(v => `
      <div class="visit-item">
        <img src="${v.user_photo_url || '/default-avatar.png'}" alt="${v.name}" class="avatar">
        <div class="visit-info">
          <strong>${v.name} ${v.first_name || ''}</strong>
          <span class="time">${new Date(v.visited_at).toLocaleTimeString()}</span>
          ${v.plan ? `<span class="plan">${v.plan}</span>` : ''}
          ${v.days_remaining !== null ? `<span class="days">${v.days_remaining} days left</span>` : ''}
        </div>
      </div>
    `).join('');
    }

    /**
     * Update expiring memberships UI
     */
    updateExpiringUI(expiring) {
        console.log('Expiring Memberships:', expiring);

        const container = document.getElementById('expiring-list');
        if (!container) return;

        if (expiring.length === 0) {
            container.innerHTML = '<p>No memberships expiring soon</p>';
            return;
        }

        container.innerHTML = expiring.map(member => `
      <div class="expiring-item ${member.days_remaining <= 3 ? 'urgent' : ''}">
        <div class="member-info">
          <strong>${member.name} ${member.first_name || ''}</strong>
          <span class="email">${member.email}</span>
        </div>
        <div class="expiry-info">
          <span class="days">${member.days_remaining} days</span>
          <button onclick="dashboard.handleRenew('${member.abonnement_id}')" class="btn-renew">
            Renew
          </button>
        </div>
      </div>
    `).join('');
    }

    /**
     * Update members list UI
     */
    updateMembersUI(members) {
        console.log('Active Members:', members);

        const container = document.getElementById('members-list');
        if (!container) return;

        container.innerHTML = members.map(member => `
      <div class="member-card" data-member-id="${member.auth_id}">
        <img src="${member.user_photo_url || '/default-avatar.png'}" alt="${member.name}">
        <h3>${member.name} ${member.first_name || ''}</h3>
        <p>${member.email}</p>
        <p>Plan: ${member.plan || 'N/A'}</p>
        <p>Expires: ${member.end_date}</p>
        <span class="status ${member.membership_status}">${member.membership_status}</span>
      </div>
    `).join('');
    }

    /**
     * Set up realtime subscriptions
     */
    setupRealtimeSubscriptions() {
        console.log('Setting up realtime subscriptions...');

        // Subscribe to new visits
        const visitsChannel = subscribeToVisits((data) => {
            console.log('🔔 New check-in!', data);

            // Show notification
            this.showNotification(`${data.user.name} just checked in!`, 'success');

            // Refresh dashboard
            this.loadDashboard();
        });
        this.channels.push(visitsChannel);

        // Subscribe to payments
        const paymentsChannel = subscribeToPayments((payload) => {
            console.log('💰 Payment event:', payload);

            if (payload.eventType === 'INSERT') {
                this.showNotification('New payment received!', 'success');
                this.loadDashboard();
            }
        });
        this.channels.push(paymentsChannel);

        console.log('Realtime subscriptions active');
    }

    /**
     * Show a notification
     */
    showNotification(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);

        // You can implement a toast notification here
        // For now, we'll just use alert
        if (type === 'success') {
            // Show success toast
        } else if (type === 'error') {
            // Show error toast
        }
    }

    /**
     * Handle member check-in (from face scanner)
     */
    async handleCheckIn(userId) {
        console.log('Processing check-in for user:', userId);

        const result = await recordVisit(userId);

        if (result.success) {
            this.showNotification('Check-in recorded successfully!', 'success');
            // Refresh visits list
            const visits = await getTodayVisits();
            this.updateVisitsUI(visits);
        } else {
            this.showNotification(`Check-in failed: ${result.error}`, 'error');
        }

        return result;
    }

    /**
     * Handle new member registration
     */
    async handleRegister(formData) {
        console.log('Registering new member:', formData);

        const result = await registerMember({
            email: formData.email,
            name: formData.name,
            first_name: formData.firstName,
            phone: formData.phone,
            plan: formData.plan,
            price: formData.price,
            duration_days: formData.durationDays || 30,
            payment_method: formData.paymentMethod,
            user_photo_url: formData.photoUrl
        });

        if (result.success) {
            this.showNotification('Member registered successfully!', 'success');
            // Refresh members list
            await this.loadDashboard();
            return result;
        } else {
            this.showNotification(`Registration failed: ${result.error}`, 'error');
            return result;
        }
    }

    /**
     * Handle membership renewal
     */
    async handleRenew(abonnementId) {
        console.log('Renewing subscription:', abonnementId);

        // You can show a modal to get duration and price
        const durationDays = parseInt(prompt('Enter duration (days):', '30'));
        const price = parseInt(prompt('Enter price:', '50'));

        if (!durationDays || !price) return;

        const result = await renewSubscription(abonnementId, durationDays, price, 'cash');

        if (result.success) {
            this.showNotification('Subscription renewed successfully!', 'success');
            await this.loadDashboard();
        } else {
            this.showNotification(`Renewal failed: ${result.error}`, 'error');
        }
    }

    /**
     * Cleanup subscriptions
     */
    cleanup() {
        console.log('Cleaning up subscriptions...');
        this.channels.forEach(channel => {
            supabase.removeChannel(channel);
        });
        this.channels = [];
    }
}

// Export for use in HTML or other modules
export const dashboard = new AdminDashboard();

// Auto-initialize if DOM is ready
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            dashboard.init();
        });
    } else {
        dashboard.init();
    }
}

// Expose to window for debugging
if (typeof window !== 'undefined') {
    window.dashboard = dashboard;
}
