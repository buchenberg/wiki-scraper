import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Container, Form, Button, ProgressBar, Card, Alert, Row, Col } from "react-bootstrap";

type Provider = "Ollama" | "LmStudio" | "DeepSeek" | "OpenAiCompatible";

function App() {
  const [query, setQuery] = useState("");
  const [maxPages, setMaxPages] = useState(5);
  const [pairsPerChunk, setPairsPerChunk] = useState(3);

  // Provider Config
  const [provider, setProvider] = useState<Provider>("Ollama");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [apiKey, setApiKey] = useState("");

  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  const [logs, setLogs] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("Idle");
  const [isScraping, setIsScraping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Defaults per provider
  useEffect(() => {
    if (provider === "Ollama") {
      setBaseUrl("http://localhost:11434");
      setApiKey("");
    } else if (provider === "LmStudio") {
      setBaseUrl("http://127.0.0.1:1234/v1"); // LM Studio standard OpenAI endpoint
      setApiKey(""); // Usually not needed for local
    } else if (provider === "DeepSeek") {
      setBaseUrl("https://api.deepseek.com");
      // Don't clear API key if user typed one
    } else if (provider === "OpenAiCompatible") {
      // Keep current or set generic default
    }
  }, [provider]);

  // Fetch models when provider config changes
  useEffect(() => {
    fetchModels();
  }, [provider, baseUrl, apiKey]); // Re-fetch when connection details change

  const fetchModels = () => {
    // Only fetch if we have a URL (and API key if needed for remote)
    if (!baseUrl) return;
    if (provider === "DeepSeek" && !apiKey) return;

    setModels([]);
    setError(null);

    invoke<string[]>("get_models", { provider, baseUrl, apiKey: apiKey || null })
      .then((models) => {
        setModels(models);
        if (models.length > 0) {
          setSelectedModel(models[0]);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch models", err);
        // Don't show alert on every keystroke, just store generic error
        // specific error can be shown if user manually tries to refresh
        if (provider !== "DeepSeek" || apiKey) {
          setError(`Failed to connect to ${provider}: ${err}`);
        }
      });
  };

  useEffect(() => {
    const unlistenLog = listen<string>("scrape-log", (event) => {
      setLogs((prev) => [...prev, event.payload]);
    });

    const unlistenProgress = listen<{ message: string; percent: number }>("scrape-progress", (event) => {
      setStatus(event.payload.message);
      setProgress(event.payload.percent);
    });

    const unlistenComplete = listen<string>("scrape-complete", (event) => {
      setIsScraping(false);
      setStatus(`Done! Saved to ${event.payload}`);
      setProgress(100);
    });

    return () => {
      unlistenLog.then((f) => f());
      unlistenProgress.then((f) => f());
      unlistenComplete.then((f) => f());
    };
  }, []);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  async function startScrape() {
    if (!selectedModel) {
      alert("Please select a model.");
      return;
    }

    setLogs([]);
    setProgress(0);
    setStatus("Starting...");
    setIsScraping(true);
    setError(null);

    try {
      await invoke("start_scrape", {
        query,
        model: selectedModel,
        provider,
        baseUrl,
        apiKey: apiKey || null,
        maxPages,
        pairsCount: pairsPerChunk
      });
    } catch (error) {
      console.error(error);
      setLogs((prev) => [...prev, `Error: ${error}`]);
      setIsScraping(false);
      setStatus("Error occurred");
      setError(String(error));
    }
  }

  return (
    <Container className="p-4">
      <h1 className="mb-4">Dataset Generator (Multi-Provider)</h1>

      {error && <Alert variant="warning" dismissible onClose={() => setError(null)}>{error}</Alert>}

      <Card className="mb-4">
        <Card.Body>
          <Form>
            <h5 className="mb-3">LLM Configuration</h5>
            <Row className="mb-3">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Provider</Form.Label>
                  <Form.Select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value as Provider)}
                    disabled={isScraping}
                  >
                    <option value="Ollama">Ollama</option>
                    <option value="LmStudio">LM Studio</option>
                    <option value="DeepSeek">DeepSeek</option>
                    <option value="OpenAiCompatible">OpenAI Compatible</option>
                  </Form.Select>
                </Form.Group>
              </Col>

              <Col md={provider === "Ollama" ? 9 : 6}>
                <Form.Group>
                  <Form.Label>Base URL</Form.Label>
                  <Form.Control
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    disabled={isScraping}
                  />
                </Form.Group>
              </Col>

              {provider !== "Ollama" && (
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>API Key</Form.Label>
                    <Form.Control
                      type="password"
                      placeholder="Optional for local"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      disabled={isScraping}
                    />
                  </Form.Group>
                </Col>
              )}
            </Row>

            <Form.Group className="mb-3">
              <Form.Label>Model</Form.Label>
              <div className="d-flex gap-2">
                <Form.Select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={isScraping || models.length === 0}
                >
                  {models.length === 0 ? <option>Loading / No models found...</option> : null}
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </Form.Select>
                <Button variant="outline-secondary" onClick={fetchModels} disabled={isScraping} title="Refresh Models">
                  ↻
                </Button>
              </div>
            </Form.Group>

            <hr />
            <h5 className="mb-3">Scraping Configuration</h5>

            <Form.Group className="mb-3">
              <Form.Label>Topic / Query</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. Artificial Intelligence"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={isScraping}
              />
            </Form.Group>

            <Row className="mb-3">
              <Col>
                <Form.Group>
                  <Form.Label>Max Pages</Form.Label>
                  <Form.Control
                    type="number"
                    value={maxPages}
                    onChange={(e) => setMaxPages(parseInt(e.target.value))}
                    disabled={isScraping}
                  />
                </Form.Group>
              </Col>
              <Col>
                <Form.Group>
                  <Form.Label>Pairs per Chunk</Form.Label>
                  <Form.Control
                    type="number"
                    value={pairsPerChunk}
                    onChange={(e) => setPairsPerChunk(parseInt(e.target.value))}
                    disabled={isScraping}
                  />
                </Form.Group>
              </Col>
            </Row>

            <Button variant="primary" onClick={startScrape} disabled={isScraping || models.length === 0}>
              {isScraping ? "Scraping..." : "Start Scrape"}
            </Button>
          </Form>
        </Card.Body>
      </Card>

      {status !== "Idle" && (
        <div className="mb-4">
          <h5>Status: {status}</h5>
          <ProgressBar now={progress} label={`${Math.round(progress)}%`} animated={isScraping} />
        </div>
      )}

      <Card>
        <Card.Header>Logs</Card.Header>
        <Card.Body style={{ height: "300px", overflowY: "auto", fontFamily: "monospace", fontSize: "0.9em" }}>
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
          <div ref={logEndRef} />
        </Card.Body>
      </Card>
    </Container>
  );
}

export default App;
