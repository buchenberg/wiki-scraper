use serde::Deserialize;
use reqwest::Client;
use serde_json::Value;
use crate::llm_client::LlmClient;

#[derive(Deserialize, Debug)]
struct WikiSearchResponse {
    query: WikiQuery,
}

#[derive(Deserialize, Debug)]
struct WikiQuery {
    search: Vec<WikiSearchResult>,
}

#[derive(Deserialize, Debug)]
struct WikiSearchResult {
    title: String,
}

#[derive(Deserialize, Debug)]
struct WikiPageResponse {
    query: WikiPageQuery,
}

#[derive(Deserialize, Debug)]
struct WikiPageQuery {
    pages: std::collections::HashMap<String, WikiPage>,
}

#[derive(Deserialize, Debug)]
struct WikiPage {
    extract: Option<String>,
    missing: Option<String>,
}

pub async fn search(query: &str, limit: u32) -> Result<Vec<String>, String> {
    let client = Client::builder()
        .user_agent("WikiScraperTauri/1.0")
        .build()
        .map_err(|e| e.to_string())?;
        
    let url = "https://en.wikipedia.org/w/api.php";
    let params = [
        ("action", "query"),
        ("format", "json"),
        ("list", "search"),
        ("srsearch", query),
        ("srlimit", &limit.to_string()),
    ];

    let resp: WikiSearchResponse = client.get(url)
        .query(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    Ok(resp.query.search.into_iter().map(|r| r.title).collect())
}

pub async fn get_content(title: &str) -> Result<Option<String>, String> {
    let client = Client::builder()
        .user_agent("WikiScraperTauri/1.0")
        .build()
        .map_err(|e| e.to_string())?;
        
    let url = "https://en.wikipedia.org/w/api.php";
    let params = [
        ("action", "query"),
        ("format", "json"),
        ("prop", "extracts"),
        ("explaintext", "true"),
        ("titles", title),
    ];

    let resp: WikiPageResponse = client.get(url)
        .query(&params)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .json()
        .await
        .map_err(|e| e.to_string())?;

    if let Some(page) = resp.query.pages.values().next() {
        if page.missing.is_none() {
            return Ok(page.extract.clone());
        }
    }
    Ok(None)
}

pub async fn generate_data(client: &LlmClient, model: &str, text: &str, topic: &str, pairs_count: u32) -> Result<Vec<Value>, String> {
    let prompt = format!(
        "You are an expert at creating high-quality training data for Large Language Models.\n\n\
        Context: The following text is from a Wikipedia article about \"{}\".\n\n\
        Task: Generate as many high-quality instruction-response pairs as possible, up to a maximum of {}, to comprehensively cover the information in the provided text.\n\
        Stop generating pairs once the entire text chunk is topically covered by the generated pairs. Do not generate redundant pairs.\n\
        The instruction should be a question or a request for information that can be answered by the text.\n\
        The response should be a clear, accurate, and concise answer derived from the text.\n\n\
        Format: Return the output as a valid JSON array of objects. Each object must have \"instruction\" and \"response\" keys.\n\
        Do not include any markdown formatting or explanations, just the raw JSON.\n\n\
        Text:\n{}\n\n\
        JSON Output:",
        topic, pairs_count, &text[..std::cmp::min(text.len(), 10000)]
    );

    println!("Starting LLM inference for topic: {}", topic);
    let output = client.generate(model, &prompt).await.map_err(|e| e.to_string())?;
    println!("LLM inference complete. Output length: {}", output.len());
    
    // Clean up markdown if present
    let clean_content = output.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```");

    // Attempt to parse JSON
    // If it fails, we might have partial JSON or text.
    let data: Value = serde_json::from_str(clean_content).map_err(|e| format!("JSON Parse Error: {}. Output: {}", e, clean_content))?;
    
    if let Some(arr) = data.as_array() {
        Ok(arr.clone())
    } else if let Some(obj) = data.as_object() {
        if let Some(pairs) = obj.get("pairs").and_then(|v| v.as_array()) {
            Ok(pairs.clone())
        } else if obj.contains_key("instruction") {
            Ok(vec![data])
        } else {
            Ok(vec![])
        }
    } else {
        Ok(vec![])
    }
}
