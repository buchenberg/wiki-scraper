use anyhow::Result;
use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq)]
pub enum LlmProvider {
    Ollama,
    LmStudio,
    DeepSeek,
    OpenAiCompatible,
}

impl LlmProvider {
    pub fn from_str(s: &str) -> Self {
        match s.to_lowercase().as_str() {
            "ollama" => LlmProvider::Ollama,
            "lmstudio" => LlmProvider::LmStudio,
            "deepseek" => LlmProvider::DeepSeek,
            _ => LlmProvider::OpenAiCompatible,
        }
    }
}

#[derive(Clone)]
pub struct LlmClient {
    provider: LlmProvider,
    base_url: String,
    api_key: Option<String>,
    client: Client,
}

// Data structures for APIs

// --- Ollama ---
#[derive(Deserialize, Debug)]
struct OllamaModel {
    name: String,
}
#[derive(Deserialize, Debug)]
struct OllamaTagsResponse {
    models: Vec<OllamaModel>,
}
#[derive(Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    stream: bool,
}
#[derive(Deserialize)]
struct OllamaGenerateResponse {
    response: String,
}

// --- OpenAI (LM Studio / DeepSeek) ---
#[derive(Serialize)]
struct OpenAiChatRequest {
    model: String,
    messages: Vec<OpenAiMessage>,
    stream: bool,
}
#[derive(Serialize, Deserialize, Debug, Clone)]
struct OpenAiMessage {
    role: String,
    content: String,
}
#[derive(Deserialize, Debug)]
struct OpenAiChatResponse {
    choices: Vec<OpenAiChoice>,
}
#[derive(Deserialize, Debug)]
struct OpenAiChoice {
    message: OpenAiMessage,
}

impl LlmClient {
    pub fn new(provider: LlmProvider, base_url: String, api_key: Option<String>) -> Self {
        Self {
            provider,
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key,
            client: Client::new(),
        }
    }

    pub async fn list_models(&self) -> Result<Vec<String>> {
        match self.provider {
            LlmProvider::Ollama => self.list_models_ollama().await,
            _ => self.list_models_openai().await,
        }
    }

    pub async fn generate(&self, model: &str, prompt: &str) -> Result<String> {
        match self.provider {
            LlmProvider::Ollama => self.generate_ollama(model, prompt).await,
            _ => self.generate_openai(model, prompt).await,
        }
    }

    // --- Private Implementations ---

    async fn list_models_ollama(&self) -> Result<Vec<String>> {
        let url = format!("{}/api/tags", self.base_url);
        let resp = self.client.get(&url).send().await?;
        let tags: OllamaTagsResponse = resp.json().await?;
        Ok(tags.models.into_iter().map(|m| m.name).collect())
    }

    async fn generate_ollama(&self, model: &str, prompt: &str) -> Result<String> {
        let url = format!("{}/api/generate", self.base_url);
        let req = OllamaGenerateRequest {
            model: model.to_string(),
            prompt: prompt.to_string(),
            stream: false,
        };
        let resp = self.client.post(&url).json(&req).send().await?;
        let gen_resp: OllamaGenerateResponse = resp.json().await?;
        Ok(gen_resp.response)
    }

    async fn list_models_openai(&self) -> Result<Vec<String>> {
        let url = format!("{}/models", self.base_url); // e.g. /v1/models
        
        let mut builder = self.client.get(&url);
        if let Some(key) = &self.api_key {
            builder = builder.bearer_auth(key);
        }
        
        let resp = builder.send().await?;
        
        if !resp.status().is_success() {
             return Err(anyhow::anyhow!("Failed to fetch models: Status {}", resp.status()));
        }

        let body_text = resp.text().await?;
        let json_body: serde_json::Value = serde_json::from_str(&body_text).map_err(|e| {
             anyhow::anyhow!("Failed to parse JSON: {}. Body: {}", e, body_text)
        })?;

        if let Some(err) = json_body.get("error") {
             return Err(anyhow::anyhow!("API Error: {}", err));
        }

        if let Some(data) = json_body.get("data").and_then(|v| v.as_array()) {
             let ids: Vec<String> = data.iter()
                .filter_map(|v| v.get("id").and_then(|s| s.as_str()).map(|s| s.to_string()))
                .collect();
             return Ok(ids);
        }

        Err(anyhow::anyhow!("Response missing 'data' field. Body: {}", body_text))
    }

    async fn generate_openai(&self, model: &str, prompt: &str) -> Result<String> {
        let url = format!("{}/chat/completions", self.base_url); // e.g. /v1/chat/completions
        
        let req = OpenAiChatRequest {
            model: model.to_string(),
            messages: vec![OpenAiMessage {
                role: "user".to_string(),
                content: prompt.to_string(),
            }],
            stream: false,
        };

        let mut builder = self.client.post(&url);
        if let Some(key) = &self.api_key {
            builder = builder.bearer_auth(key);
        }

        let resp = builder.json(&req).send().await?;
        
        if !resp.status().is_success() {
             let text = resp.text().await.unwrap_or_default();
             return Err(anyhow::anyhow!("Generation failed: {}", text));
        }

        let chat_resp: OpenAiChatResponse = resp.json().await?;
        
        if let Some(choice) = chat_resp.choices.first() {
            Ok(choice.message.content.clone())
        } else {
            Err(anyhow::anyhow!("No choices returned from OpenAI API"))
        }
    }
}
