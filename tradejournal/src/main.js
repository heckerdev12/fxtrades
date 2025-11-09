console.log('Script loaded');

// Check if Tauri API is available
if (!window.__TAURI__) {
    console.error('Tauri API not available!');
    alert('Tauri API not loaded. Please ensure you are running this in a Tauri app.');
}

const { invoke } = window.__TAURI__.core;

let db;
let currentProfile = null;
let currentAccount = null;
let accounts = [];
let trades = [];

// Initialize database
async function initDB() {
    try {
        console.log('Checking Tauri plugins...');
        console.log('Available Tauri objects:', Object.keys(window.__TAURI__));
        console.log('SQL Plugin available?', window.__TAURI_PLUGIN_SQL__);
        
        if (!window.__TAURI_PLUGIN_SQL__) {
            throw new Error('SQL plugin not loaded. Check tauri.conf.json and Cargo.toml');
        }
        
        console.log('Initializing database...');
        const Database = window.__TAURI_PLUGIN_SQL__;
        
        db = await Database.load('sqlite:trading_journal.db');
        console.log('Database initialized successfully:', db);
        
        // Verify db has the execute method
        if (!db || typeof db.execute !== 'function') {
            throw new Error('Database object is invalid');
        }
        
        return true;
    } catch (error) {
        console.error('Database initialization error:', error);
        console.error('Error stack:', error.stack);
        alert('Failed to initialize database: ' + error.message);
        return false;
    }
}

// Initialize app
async function init() {
    console.log('Initializing app...');
    const dbReady = await initDB();
    if (!dbReady) {
        console.error('Cannot proceed without database');
        return;
    }
    
    const profile = await loadProfile();
    console.log('Loaded profile:', profile);
    
    if (profile) {
        currentProfile = profile;
        showMainApp();
        await loadAccounts();
        updateStats();
    } else {
        console.log('No profile found, showing setup screen');
    }
}

function showMainApp() {
    console.log('Showing main app');
    document.getElementById('profileSetup').classList.remove('active');
    document.getElementById('mainApp').classList.add('active');
    
    document.getElementById('displayName').textContent = currentProfile.name;
    document.getElementById('displayEmail').textContent = '';
    document.getElementById('userAvatar').textContent = currentProfile.name.charAt(0).toUpperCase();
}

// Profile functions - WAIT for DOM to be ready
function setupProfileForm() {
    const form = document.getElementById('profileForm');
    if (!form) {
        console.error('Profile form not found!');
        return;
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Profile form submitted');
        
        try {
            const userName = document.getElementById('userName');
            const currency = document.getElementById('currency');
            
            if (!userName || !currency) {
                throw new Error('Form fields not found');
            }
            
            if (!userName.value || !currency.value) {
                throw new Error('Please fill in all required fields');
            }
            
            if (!db) {
                throw new Error('Database not initialized. Please refresh the page.');
            }
            
            const profile = {
                name: userName.value,
                currency: currency.value
            };
            
            console.log('Saving profile:', profile);
            await saveProfile(profile);
            console.log('Profile saved successfully');
            
            currentProfile = profile;
            showMainApp();
            await loadAccounts();
        } catch (error) {
            console.error('Error saving profile:', error);
            const errorMessage = error && error.message ? error.message : 'Unknown error occurred';
            alert('Failed to save profile: ' + errorMessage);
        }
    });
}

// Account functions
function setupAccountForm() {
    const form = document.getElementById('accountForm');
    if (!form) {
        console.error('Account form not found!');
        return;
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Account form submitted');
        
        try {
            const account = {
                name: document.getElementById('accountName').value,
                type: document.getElementById('accountType').value,
                initialBalance: parseFloat(document.getElementById('initialBalance').value),
                currentBalance: parseFloat(document.getElementById('initialBalance').value),
                broker: document.getElementById('broker').value,
                leverage: document.getElementById('leverage').value,
                instruments: document.getElementById('instruments').value
            };
            
            console.log('Saving account:', account);
            await saveAccount(account);
            console.log('Account saved successfully');
            
            await loadAccounts();
            closeAccountModal();
            document.getElementById('accountForm').reset();
        } catch (error) {
            console.error('Error saving account:', error);
            alert('Failed to save account: ' + error.message);
        }
    });
}

function openAccountModal() {
    document.getElementById('accountModal').classList.add('active');
}

function closeAccountModal() {
    document.getElementById('accountModal').classList.remove('active');
}

async function loadAccounts() {
    try {
        console.log('Loading accounts...');
        const result = await db.select('SELECT * FROM accounts ORDER BY id DESC');
        console.log('Accounts loaded:', result);
        
        accounts = result.map(row => ({
            id: row.id,
            name: row.name,
            type: row.type,
            initialBalance: row.initial_balance,
            currentBalance: row.current_balance,
            broker: row.broker,
            leverage: row.leverage,
            instruments: row.instruments
        }));
        renderAccounts();
    } catch (error) {
        console.error('Error loading accounts:', error);
    }
}

function renderAccounts() {
    const grid = document.getElementById('accountsGrid');
    if (accounts.length === 0) {
        grid.innerHTML = '<div class="empty-state"><p>No trading accounts yet. Create one to start journaling!</p></div>';
        return;
    }

    grid.innerHTML = accounts.map(acc => `
        <div class="account-card ${currentAccount?.id === acc.id ? 'active' : ''}" onclick="selectAccount(${acc.id})">
            <h3>${acc.name}</h3>
            <p>${acc.broker} | ${acc.leverage}</p>
            <p>${acc.type === 'demo' ? '📊 Demo' : '💰 Live'} Account</p>
            <div class="account-balance">${currentProfile.currency} ${acc.currentBalance.toFixed(2)}</div>
        </div>
    `).join('');
}

async function selectAccount(id) {
    console.log('Selecting account:', id);
    currentAccount = accounts.find(a => a.id === id);
    await loadTrades(id);
    renderAccounts();
    document.getElementById('tradesSection').style.display = 'block';
}

// Trade form setup
function setupTradeForm() {
    const form = document.getElementById('tradeForm');
    if (!form) {
        console.error('Trade form not found!');
        return;
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Trade form submitted');
        
        if (!currentAccount) {
            alert('Please select an account first');
            return;
        }

        try {
            const trade = {
                accountId: currentAccount.id,
                symbol: document.getElementById('symbol').value,
                type: document.getElementById('tradeType').value,
                entryPrice: parseFloat(document.getElementById('entryPrice').value),
                exitPrice: parseFloat(document.getElementById('exitPrice').value) || null,
                takeProfit: parseFloat(document.getElementById('takeProfit').value),
                stopLoss: parseFloat(document.getElementById('stopLoss').value),
                lotSize: parseFloat(document.getElementById('lotSize').value),
                volume: parseFloat(document.getElementById('volume').value),
                profit: parseFloat(document.getElementById('profit').value),
                commission: parseFloat(document.getElementById('commission').value) || 0,
                rrRatio: document.getElementById('rrRatio').value,
                strategy: document.getElementById('strategy').value,
                session: document.getElementById('session').value,
                duration: document.getElementById('duration').value,
                date: new Date().toISOString()
            };

            console.log('Saving trade:', trade);
            await saveTrade(trade);
            console.log('Trade saved successfully');
            
            await loadTrades(currentAccount.id);
            updateStats();
            closeTradeModal();
            document.getElementById('tradeForm').reset();
        } catch (error) {
            console.error('Error saving trade:', error);
            alert('Failed to save trade: ' + error.message);
        }
    });
}

function calculateRR() {
    const entry = parseFloat(document.getElementById('entryPrice').value);
    const tp = parseFloat(document.getElementById('takeProfit').value);
    const sl = parseFloat(document.getElementById('stopLoss').value);

    if (entry && tp && sl) {
        const risk = Math.abs(entry - sl);
        const reward = Math.abs(tp - entry);
        const ratio = (reward / risk).toFixed(2);
        document.getElementById('rrRatio').value = `1:${ratio}`;
    }
}

function openTradeModal() {
    if (!currentAccount) {
        alert('Please select an account first');
        return;
    }
    document.getElementById('tradeModal').classList.add('active');
}

function closeTradeModal() {
    document.getElementById('tradeModal').classList.remove('active');
}

async function loadTrades(accountId) {
    try {
        console.log('Loading trades for account:', accountId);
        const result = await db.select('SELECT * FROM trades WHERE account_id = ? ORDER BY date DESC', [accountId]);
        console.log('Trades loaded:', result);
        
        trades = result.map(row => ({
            id: row.id,
            accountId: row.account_id,
            symbol: row.symbol,
            type: row.type,
            entryPrice: row.entry_price,
            exitPrice: row.exit_price,
            takeProfit: row.take_profit,
            stopLoss: row.stop_loss,
            lotSize: row.lot_size,
            volume: row.volume,
            profit: row.profit,
            commission: row.commission,
            rrRatio: row.rr_ratio,
            strategy: row.strategy,
            session: row.session,
            duration: row.duration,
            date: row.date
        }));
        renderTrades();
    } catch (error) {
        console.error('Error loading trades:', error);
    }
}

function renderTrades() {
    const tbody = document.getElementById('tradesBody');
    if (trades.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #8892a0;">No trades yet</td></tr>';
        return;
    }

    tbody.innerHTML = trades.map(trade => `
        <tr>
            <td>${new Date(trade.date).toLocaleDateString()}</td>
            <td>${trade.symbol}</td>
            <td><span class="badge badge-${trade.type}">${trade.type.toUpperCase()}</span></td>
            <td>${trade.entryPrice}</td>
            <td>${trade.exitPrice || '-'}</td>
            <td>${trade.lotSize}</td>
            <td class="${trade.profit >= 0 ? 'profit-positive' : 'profit-negative'}">
                ${trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
            </td>
            <td>${trade.rrRatio || '-'}</td>
        </tr>
    `).join('');
}

function updateStats() {
    if (trades.length === 0) return;

    const totalPnL = trades.reduce((sum, t) => sum + t.profit, 0);
    const wins = trades.filter(t => t.profit > 0).length;
    const winRate = (wins / trades.length * 100).toFixed(1);
    const totalVolume = trades.reduce((sum, t) => sum + t.volume, 0);

    document.getElementById('totalPnL').textContent = `${currentProfile.currency} ${totalPnL.toFixed(2)}`;
    document.getElementById('totalPnL').className = totalPnL >= 0 ? 'value positive' : 'value negative';
    document.getElementById('totalTrades').textContent = trades.length;
    document.getElementById('winRate').textContent = `${winRate}%`;
    document.getElementById('totalVolume').textContent = totalVolume.toLocaleString();
}

// Database functions
async function saveProfile(profile) {
    try {
        console.log('Executing profile save SQL...');
        console.log('Profile data:', profile);
        console.log('Database object:', db);
        
        if (!db) {
            throw new Error('Database is not initialized');
        }
        
        if (typeof db.execute !== 'function') {
            throw new Error('Database execute function is not available');
        }
        
        const result = await db.execute(
            'INSERT OR REPLACE INTO profile (id, name, email, experience, currency, timezone) VALUES (1, ?, ?, ?, ?, ?)',
            [profile.name, '', '', profile.currency, '']
        );
        console.log('Profile save result:', result);
        return result;
    } catch (error) {
        console.error('Error in saveProfile:', error);
        console.error('Error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        throw error;
    }
}

async function loadProfile() {
    try {
        console.log('Executing profile load SQL...');
        const result = await db.select('SELECT * FROM profile WHERE id = 1');
        console.log('Profile load result:', result);
        
        if (result.length > 0) {
            return {
                name: result[0].name,
                currency: result[0].currency
            };
        }
    } catch (e) {
        console.log('No profile found:', e);
    }
    return null;
}

async function saveAccount(account) {
    console.log('Executing account save SQL...');
    const result = await db.execute(
        'INSERT INTO accounts (name, type, initial_balance, current_balance, broker, leverage, instruments) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [account.name, account.type, account.initialBalance, account.currentBalance, account.broker, account.leverage, account.instruments || '']
    );
    console.log('Account save result:', result);
}

async function saveTrade(trade) {
    console.log('Executing trade save SQL...');
    const result = await db.execute(
        'INSERT INTO trades (account_id, symbol, type, entry_price, exit_price, take_profit, stop_loss, lot_size, volume, profit, commission, rr_ratio, strategy, session, duration, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
            trade.accountId,
            trade.symbol,
            trade.type,
            trade.entryPrice,
            trade.exitPrice,
            trade.takeProfit,
            trade.stopLoss,
            trade.lotSize,
            trade.volume,
            trade.profit,
            trade.commission,
            trade.rrRatio || '',
            trade.strategy || '',
            trade.session || '',
            trade.duration || '',
            trade.date
        ]
    );
    console.log('Trade save result:', result);
}
// Test database connection
async function testDatabase() {
    try {
        console.log('=== DATABASE TEST START ===');
        console.log('DB object:', db);
        console.log('DB methods:', Object.keys(db));
        
        // Try a simple select
        const testSelect = await db.select('SELECT 1 as test');
        console.log('Test SELECT result:', testSelect);
        
        // Try creating a test row
        const testInsert = await db.execute(
            'INSERT OR REPLACE INTO profile (id, name, email, experience, currency, timezone) VALUES (999, ?, ?, ?, ?, ?)',
            ['TestUser', 'test@test.com', 'beginner', 'USD', 'UTC']
        );
        console.log('Test INSERT result:', testInsert);
        
        // Check if it was inserted
        const checkInsert = await db.select('SELECT * FROM profile WHERE id = 999');
        console.log('Check INSERT result:', checkInsert);
        
        console.log('=== DATABASE TEST END ===');
        return true;
    } catch (error) {
        console.error('Database test failed:', error);
        return false;
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing...');
    
    // Initialize app and database FIRST
    await init();
    
    // TEST DATABASE
    await testDatabase();
    
    // THEN setup all form listeners (after db is ready)
    setupProfileForm();
    setupAccountForm();
    setupTradeForm();
    
    // Setup R:R calculator
    ['entryPrice', 'takeProfit', 'stopLoss'].forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener('input', calculateRR);
        }
    });
});