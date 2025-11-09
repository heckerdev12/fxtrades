// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_sql::{Builder, Migration, MigrationKind};

#[derive(Debug, Serialize, Deserialize)]
struct Profile {
    name: String,
    email: Option<String>,
    experience: String,
    currency: String,
    timezone: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct Account {
    id: Option<i64>,
    name: String,
    #[serde(rename = "type")]
    account_type: String,
    #[serde(rename = "initialBalance")]
    initial_balance: f64,
    #[serde(rename = "currentBalance")]
    current_balance: f64,
    broker: String,
    leverage: String,
    instruments: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct Trade {
    id: Option<i64>,
    #[serde(rename = "accountId")]
    account_id: i64,
    symbol: String,
    #[serde(rename = "type")]
    trade_type: String,
    #[serde(rename = "entryPrice")]
    entry_price: f64,
    #[serde(rename = "exitPrice")]
    exit_price: Option<f64>,
    #[serde(rename = "takeProfit")]
    take_profit: f64,
    #[serde(rename = "stopLoss")]
    stop_loss: f64,
    #[serde(rename = "lotSize")]
    lot_size: f64,
    volume: f64,
    profit: f64,
    commission: f64,
    #[serde(rename = "rrRatio")]
    rr_ratio: Option<String>,
    strategy: Option<String>,
    session: Option<String>,
    duration: Option<String>,
    date: String,
}

#[tauri::command]
async fn save_profile(profile: Profile) -> Result<String, String> {
    // Using Tauri's SQL plugin execute directly
    Ok(serde_json::to_string(&profile).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn get_profile() -> Result<Option<Profile>, String> {
    // Placeholder - will be handled by frontend SQL calls
    Ok(None)
}

#[tauri::command]
async fn save_account(account: Account) -> Result<String, String> {
    Ok(serde_json::to_string(&account).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn get_accounts() -> Result<Vec<Account>, String> {
    Ok(vec![])
}

#[tauri::command]
async fn save_trade(trade: Trade) -> Result<String, String> {
    Ok(serde_json::to_string(&trade).map_err(|e| e.to_string())?)
}

#[tauri::command]
async fn get_trades(account_id: i64) -> Result<Vec<Trade>, String> {
    Ok(vec![])
}

fn main() {
    let migrations = vec![Migration {
        version: 1,
        description: "create initial tables",
        sql: "
                CREATE TABLE IF NOT EXISTS profile (
                    id INTEGER PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT,
                    experience TEXT NOT NULL,
                    currency TEXT NOT NULL,
                    timezone TEXT NOT NULL
                );
                
                CREATE TABLE IF NOT EXISTS accounts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    type TEXT NOT NULL,
                    initial_balance REAL NOT NULL,
                    current_balance REAL NOT NULL,
                    broker TEXT NOT NULL,
                    leverage TEXT NOT NULL,
                    instruments TEXT
                );
                
                CREATE TABLE IF NOT EXISTS trades (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    account_id INTEGER NOT NULL,
                    symbol TEXT NOT NULL,
                    type TEXT NOT NULL,
                    entry_price REAL NOT NULL,
                    exit_price REAL,
                    take_profit REAL NOT NULL,
                    stop_loss REAL NOT NULL,
                    lot_size REAL NOT NULL,
                    volume REAL NOT NULL,
                    profit REAL NOT NULL,
                    commission REAL DEFAULT 0,
                    rr_ratio TEXT,
                    strategy TEXT,
                    session TEXT,
                    duration TEXT,
                    date TEXT NOT NULL,
                    FOREIGN KEY (account_id) REFERENCES accounts (id)
                );
            ",
        kind: MigrationKind::Up,
    }];

    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(
            Builder::default()
                .add_migrations("sqlite:trading_journal.db", migrations)
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_profile,
            get_profile,
            save_account,
            get_accounts,
            save_trade,
            get_trades
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
