/**
 * History Page Manager
 * Handles the browsing history page functionality
 */
class HistoryPageManager {
    constructor() {
        this.historyData = [];
        this.filteredData = [];
        this.isInitialized = false;
        this.searchTimeout = null;
        
        this.init();
    }

    /**
     * Initialize the history page
     */
    init() {
        this.setupEventListeners();
        this.requestHistoryData();
        console.log('[History Page] Initialized');
    }

    /**
     * Set up all event listeners
     */
    setupEventListeners() {
        // Search input with debounce
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', this.handleSearchDebounced.bind(this));
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    searchInput.value = '';
                    this.handleSearch('');
                }
            });
        }

        // Clear history button
        const clearBtn = document.getElementById('clearHistoryBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', this.handleClearHistory.bind(this));
        }

        // Listen for messages from parent
        window.addEventListener('message', this.handleMessage.bind(this));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'f':
                        e.preventDefault();
                        searchInput?.focus();
                        break;
                    case 'r':
                        e.preventDefault();
                        this.refreshHistory();
                        break;
                }
            }
        });

        console.log('[History Page] Event listeners set up');
    }

    /**
     * Request history data from parent window
     */
    requestHistoryData() {
        console.log('[History Page] Requesting history data...');
        this.sendMessageToParent({
            type: 'request-history-data'
        });
    }

    /**
     * Refresh history data
     */
    refreshHistory() {
        this.showLoadingState();
        this.requestHistoryData();
    }

    /**
     * Handle messages from parent window
     */
    handleMessage(event) {
        if (event.source !== parent) return;
        
        const message = event.data;
        if (!message || message.source !== 'history-service') return;

        console.log('[History Page] Received message:', message.type);

        switch (message.type) {
            case 'history-data-response':
                this.receiveHistoryData(message.data);
                break;
            case 'search-results-response':
                this.receiveSearchResults(message.results);
                break;
            default:
                console.log('[History Page] Unknown message type:', message.type);
        }
    }

    /**
     * Send message to parent window
     */
    sendMessageToParent(message) {
        parent.postMessage({
            source: 'history-page',
            ...message
        }, '*');
    }

    /**
     * Receive and process history data
     */
    receiveHistoryData(data) {
        console.log('[History Page] Received history data:', data?.length || 0, 'items');
        this.historyData = Array.isArray(data) ? data : [];
        this.filteredData = [...this.historyData];
        this.isInitialized = true;
        this.renderHistory();
        this.updateStats();
    }

    /**
     * Receive search results
     */
    receiveSearchResults(results) {
        console.log('[History Page] Received search results:', results?.length || 0, 'items');
        this.filteredData = Array.isArray(results) ? results : [];
        this.renderHistory();
    }

    /**
     * Handle search with debouncing
     */
    handleSearchDebounced(event) {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.handleSearch(event.target.value);
        }, 300);
    }

    /**
     * Handle search functionality
     */
    handleSearch(query) {
        const trimmedQuery = query.trim();
        
        if (!trimmedQuery) {
            this.filteredData = [...this.historyData];
            this.renderHistory();
            return;
        }

        // Send search request to parent
        this.sendMessageToParent({
            type: 'search-history',
            query: trimmedQuery
        });
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        const historyList = document.getElementById('historyList');
        if (historyList) {
            historyList.innerHTML = `
                <div class="history-loading">
                    <div class="loading-spinner"></div>
                    Loading your browsing history...
                </div>
            `;
        }
    }

    /**
     * Render the history list
     */
    renderHistory() {
        const historyList = document.getElementById('historyList');
        if (!historyList) return;

        if (this.filteredData.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty-state">
                    <h3>No history found</h3>
                    <p>Start browsing to see your history here.</p>
                </div>
            `;
            return;
        }

        const historyHTML = this.filteredData.map(item => this.createHistoryItemHTML(item)).join('');
        historyList.innerHTML = historyHTML;

        // Add click listeners
        this.addItemClickListeners();
    }

    /**
     * Create HTML for a single history item
     */
    createHistoryItemHTML(item) {
        const date = new Date(item.visitTime || item.timestamp || Date.now());
        const formattedDate = this.formatDate(date);
        const title = item.title || item.url || 'Untitled';
        const url = item.url || '';
        const favicon = this.getFaviconDisplay(url);
        
        return `
            <div class="history-item" data-url="${this.escapeHtml(url)}" data-id="${this.escapeHtml(item.id)}">
                <div class="history-favicon">${favicon}</div>
                <div class="history-item-content">
                    <div class="history-item-title">${this.escapeHtml(title)}</div>
                    <div class="history-item-url">${this.escapeHtml(url)}</div>
                </div>
                <div class="history-item-date">${formattedDate}</div>
                <button class="history-delete-btn" data-id="${this.escapeHtml(item.id)}" title="Delete">×</button>
            </div>
        `;
    }

    /**
     * Add click listeners to history items
     */
    addItemClickListeners() {
        // Navigate to URL on item click
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't navigate if delete button was clicked
                if (e.target.classList.contains('history-delete-btn')) return;
                
                const url = item.dataset.url;
                if (url) {
                    this.navigateToUrl(url);
                }
            });
        });

        // Delete item on delete button click
        document.querySelectorAll('.history-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const itemId = btn.dataset.id;
                if (itemId) {
                    this.deleteHistoryItem(itemId);
                }
            });
        });
    }

    /**
     * Navigate to a URL
     */
    navigateToUrl(url) {
        console.log('[History Page] Navigating to:', url);
        this.sendMessageToParent({
            type: 'navigate-to-url',
            url: url
        });
    }

    /**
     * Delete a history item
     */
    deleteHistoryItem(itemId) {
        console.log('[History Page] Deleting history item:', itemId);
        
        // Remove from local data immediately for UI responsiveness
        this.historyData = this.historyData.filter(item => item.id !== itemId);
        this.filteredData = this.filteredData.filter(item => item.id !== itemId);
        
        // Send delete request to parent
        this.sendMessageToParent({
            type: 'delete-history-item',
            itemId: itemId
        });
        
        // Re-render immediately
        this.renderHistory();
        this.updateStats();
    }

    /**
     * Handle clear all history
     */
    handleClearHistory() {
        const confirmMessage = 'Are you sure you want to clear all browsing history? This action cannot be undone.';
        
        if (confirm(confirmMessage)) {
            console.log('[History Page] Clearing all history');
            
            // Clear local data
            this.historyData = [];
            this.filteredData = [];
            
            // Send clear request to parent
            this.sendMessageToParent({
                type: 'clear-history'
            });
            
            // Update UI
            this.renderHistory();
            this.updateStats();
        }
    }

    /**
     * Get favicon display for a URL
     */
    getFaviconDisplay(url) {
        try {
            const domain = new URL(url).hostname;
            const firstLetter = domain.charAt(0).toUpperCase();
            return firstLetter || '🌐';
        } catch {
            return '🌐';
        }
    }

    /**
     * Update statistics display
     */
    updateStats() {
        const statsContainer = document.getElementById('historyStats');
        if (!statsContainer) return;

        if (!this.historyData.length) {
            statsContainer.style.display = 'none';
            return;
        }

        const stats = this.calculateStats();
        
        const totalItemsEl = document.getElementById('totalItems');
        const todayItemsEl = document.getElementById('todayItems');
        const weekItemsEl = document.getElementById('weekItems');

        if (totalItemsEl) totalItemsEl.textContent = stats.total;
        if (todayItemsEl) todayItemsEl.textContent = stats.today;
        if (weekItemsEl) weekItemsEl.textContent = stats.week;
        
        statsContainer.style.display = 'flex';
    }

    /**
     * Calculate history statistics
     */
    calculateStats() {
        const now = Date.now();
        const oneDayAgo = now - (24 * 60 * 60 * 1000);
        const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);

        const todayItems = this.historyData.filter(item => 
            (item.visitTime || item.timestamp || 0) > oneDayAgo
        ).length;
        
        const weekItems = this.historyData.filter(item => 
            (item.visitTime || item.timestamp || 0) > oneWeekAgo
        ).length;

        return {
            total: this.historyData.length,
            today: todayItems,
            week: weekItems
        };
    }

    /**
     * Format date for display
     */
    formatDate(date) {
        const now = new Date();
        const diffMs = now - date;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        if (diffHours < 1) {
            return 'Just now';
        } else if (diffHours < 24) {
            return `${diffHours}h ago`;
        } else if (diffDays === 1) {
            return 'Yesterday';
        } else if (diffDays < 7) {
            return `${diffDays}d ago`;
        } else if (diffDays < 30) {
            const weeks = Math.floor(diffDays / 7);
            return `${weeks}w ago`;
        } else {
            return date.toLocaleDateString();
        }
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Global functions for backwards compatibility
function receiveHistoryData(data) {
    if (window.historyManager) {
        window.historyManager.receiveHistoryData(data);
    }
}

function receiveSearchResults(results) {
    if (window.historyManager) {
        window.historyManager.receiveSearchResults(results);
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.historyManager = new HistoryPageManager();
    console.log('[History Page] DOM loaded and history manager initialized');
});

console.log('[History Page] Script loaded');