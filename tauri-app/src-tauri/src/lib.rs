mod scraper;
mod llm_client;

use tauri::{Emitter, State};
use std::fs::File;
use std::io::Write;
use llm_client::{LlmClient, LlmProvider};

struct AppState {
    // Stateless for now
}

#[tauri::command]
async fn get_models(provider: String, base_url: String, api_key: Option<String>) -> Result<Vec<String>, String> {
    let provider_enum = LlmProvider::from_str(&provider);
    let client = LlmClient::new(provider_enum, base_url, api_key);
    client.list_models().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn start_scrape(
    app: tauri::AppHandle, 
    _state: State<'_, AppState>, 
    query: String, 
    model: String, 
    provider: String,
    base_url: String,
    api_key: Option<String>,
    max_pages: u32, 
    pairs_count: u32
) -> Result<String, String> {
    if model.is_empty() {
        return Err("Please select a model.".to_string());
    }

    let provider_enum = LlmProvider::from_str(&provider);
    let client = LlmClient::new(provider_enum, base_url, api_key);
    
    app.emit("scrape-log", format!("Starting search for '{}' using model '{}'...", query, model)).unwrap();
    
    let pages = scraper::search(&query, max_pages).await.map_err(|e| e.to_string())?;
    app.emit("scrape-log", format!("Found {} pages: {:?}", pages.len(), pages)).unwrap();
    
    let mut all_data = Vec::new();
    let total_pages = pages.len();
    
    for (i, page) in pages.iter().enumerate() {
        app.emit("scrape-progress", serde_json::json!({
            "message": format!("Processing page: {}", page),
            "percent": (i as f64 / total_pages as f64) * 100.0
        })).unwrap();
        
        app.emit("scrape-log", format!("Fetching content for '{}'...", page)).unwrap();
        match scraper::get_content(page).await {
            Ok(Some(content)) => {
                app.emit("scrape-log", format!("Content fetched. Length: {} chars", content.len())).unwrap();
                println!("Content length: {}", content.len());
                // Chunking
                let chunks: Vec<String> = content.chars()
                    .collect::<Vec<char>>()
                    .chunks(6000) // Increased chunk size for stronger models
                    .map(|c| c.iter().collect())
                    .take(3) // Limit to 3 chunks
                    .collect();
                
                app.emit("scrape-log", format!("Created {} chunks", chunks.len())).unwrap();
                    
                for (chunk_idx, chunk) in chunks.iter().enumerate() {
                    if chunk.len() < 500 { continue; }
                    
                    app.emit("scrape-log", format!("Processing chunk {}/{} ({} chars)...", chunk_idx + 1, chunks.len(), chunk.len())).unwrap();
                    
                    match scraper::generate_data(&client, &model, &chunk, page, pairs_count).await {
                        Ok(pairs) => {
                            app.emit("scrape-log", format!("Generated {} pairs for '{}'", pairs.len(), page)).unwrap();
                            all_data.extend(pairs);
                        },
                        Err(e) => app.emit("scrape-log", format!("Error generating data: {}", e)).unwrap(),
                    }
                }
            },
            Ok(None) => app.emit("scrape-log", format!("No content for '{}'", page)).unwrap(),
            Err(e) => app.emit("scrape-log", format!("Error fetching '{}': {}", page, e)).unwrap(),
        }
    }
    
    app.emit("scrape-progress", serde_json::json!({
        "message": "Saving data...",
        "percent": 100.0
    })).unwrap();
    
    // Save to file
    let path = "dataset.jsonl";
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    
    for item in all_data {
        let line = serde_json::to_string(&item).map_err(|e| e.to_string())? + "\n";
        file.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    }
    
    app.emit("scrape-log", format!("Saved data to {}", path)).unwrap();
    app.emit("scrape-complete", path).unwrap();
    
    Ok(path.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {})
        .invoke_handler(tauri::generate_handler![start_scrape, get_models])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
