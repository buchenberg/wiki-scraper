import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Container, Form, Button, ProgressBar, Card, Alert, Row, Col, ListGroup } from "react-bootstrap";
import "./App.css";

type Provider = "Ollama" | "LmStudio" | "DeepSeek" | "OpenAiCompatible";

type WizardStep = "LLMConfig" | "Search" | "Select" | "ScrapeConfig" | "Progress";

function App() {
  const [step, setStep] = useState<WizardStep>("LLMConfig");

  // Data State
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);
  const [selectedPages, setSelectedPages] = useState<string[]>([]);
  const [pairsPerChunk, setPairsPerChunk] = useState(3);

  // Provider Config
  const [provider, setProvider] = useState<Provider>("Ollama");
  const [baseUrl, setBaseUrl] = useState("http://localhost:11434");
  const [apiKey, setApiKey] = useState("");

  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");

  // Progress/Logs State
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
      setBaseUrl("http://127.0.0.1:1234/v1");
      setApiKey("");
    } else if (provider === "DeepSeek") {
      setBaseUrl("https://api.deepseek.com");
    }
  }, [provider]);

  // Fetch models when provider config changes
  useEffect(() => {
    fetchModels();
  }, [provider, baseUrl, apiKey]);

  const fetchModels = () => {
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

  // Actions
  const handleSearch = async () => {
    if (!query) return;
    try {
      setError(null);
      const results = await invoke<string[]>("search_wiki", { query });
      setSearchResults(results);
      setStep("Select");
    } catch (err) {
      setError(`Search failed: ${err}`);
    }
  };

  const handleStartScrape = async () => {
    if (!selectedModel || selectedPages.length === 0) return;

    setLogs([]);
    setProgress(0);
    setStatus("Starting...");
    setIsScraping(true);
    setError(null);
    setStep("Progress");

    try {
      await invoke("start_scrape_selected", {
        pages: selectedPages,
        model: selectedModel,
        provider,
        baseUrl,
        apiKey: apiKey || null,
        pairsCount: pairsPerChunk
      });
    } catch (error) {
      console.error(error);
      setLogs((prev) => [...prev, `Error: ${error}`]);
      setIsScraping(false);
      setStatus("Error occurred");
      setError(String(error));
    }
  };

  // Selection Helpers
  const togglePage = (page: string) => {
    if (selectedPages.includes(page)) {
      setSelectedPages(selectedPages.filter(p => p !== page));
    } else {
      setSelectedPages([...selectedPages, page]);
    }
  };

  const selectAll = () => setSelectedPages([...searchResults]);
  const deselectAll = () => setSelectedPages([]);

  // Render Steps
  const renderStep = () => {
    switch (step) {
      case "LLMConfig":
        return (
          <div className="fade-in">
            <h5 className="mb-3">Step 1: LLM Configuration</h5>
            <Row className="mb-3">
              <Col md={3}>
                <Form.Group>
                  <Form.Label>Provider</Form.Label>
                  <Form.Select value={provider} onChange={(e) => setProvider(e.target.value as Provider)}>
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
                  <Form.Control value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                </Form.Group>
              </Col>
              {provider !== "Ollama" && (
                <Col md={3}>
                  <Form.Group>
                    <Form.Label>API Key</Form.Label>
                    <Form.Control type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
                  </Form.Group>
                </Col>
              )}
            </Row>
            <Form.Group className="mb-3">
              <Form.Label>Model</Form.Label>
              <div className="d-flex gap-2">
                <Form.Select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
                  {models.length === 0 ? <option>Loading / No models found...</option> : null}
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </Form.Select>
                <Button variant="outline-secondary" onClick={fetchModels}>↻</Button>
              </div>
            </Form.Group>
            <div className="d-flex justify-content-end mt-4">
              <Button onClick={() => setStep("Search")} disabled={!selectedModel || models.length === 0}>Next</Button>
            </div>
          </div>
        );

      case "Search":
        return (
          <div className="fade-in">
            <h5 className="mb-3">Step 2: Search Wikipedia</h5>
            <Form.Group className="mb-3">
              <Form.Label>Topic / Query</Form.Label>
              <Form.Control
                type="text"
                placeholder="e.g. Artificial Intelligence"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                autoFocus
              />
            </Form.Group>
            <div className="d-flex justify-content-between mt-4">
              <Button variant="secondary" onClick={() => setStep("LLMConfig")}>Back</Button>
              <Button onClick={handleSearch} disabled={!query}>Search</Button>
            </div>
          </div>
        );

      case "Select":
        return (
          <div className="fade-in">
            <h5 className="mb-3">Step 3: Select Pages ({selectedPages.length} selected)</h5>
            <div className="d-flex gap-2 mb-2">
              <Button size="sm" variant="outline-primary" onClick={selectAll}>Select All</Button>
              <Button size="sm" variant="outline-secondary" onClick={deselectAll}>Deselect All</Button>
            </div>
            <Card className="mb-3" style={{ maxHeight: "400px", overflowY: "auto" }}>
              <ListGroup variant="flush">
                {searchResults.map((result) => (
                  <ListGroup.Item key={result} className="d-flex align-items-center">
                    <Form.Check
                      type="checkbox"
                      id={`check-${result}`}
                      checked={selectedPages.includes(result)}
                      onChange={() => togglePage(result)}
                      label={result}
                      className="flex-grow-1"
                    />
                  </ListGroup.Item>
                ))}
              </ListGroup>
            </Card>
            <div className="d-flex justify-content-between mt-4">
              <Button variant="secondary" onClick={() => setStep("Search")}>Back</Button>
              <Button onClick={() => setStep("ScrapeConfig")} disabled={selectedPages.length === 0}>Next</Button>
            </div>
          </div>
        );

      case "ScrapeConfig":
        return (
          <div className="fade-in">
            <h5 className="mb-3">Step 4: Scrape Configuration</h5>
            <Alert variant="info">
              Selected {selectedPages.length} pages. Using model: <strong>{selectedModel}</strong>
            </Alert>
            <Form.Group className="mb-3">
              <Form.Label>Instruction-Response Pairs per Chunk</Form.Label>
              <Form.Control
                type="number"
                value={pairsPerChunk}
                onChange={(e) => setPairsPerChunk(parseInt(e.target.value))}
              />
              <Form.Text className="text-muted">
                Higher values may take longer and require a larger context window.
              </Form.Text>
            </Form.Group>
            <div className="d-flex justify-content-between mt-4">
              <Button variant="secondary" onClick={() => setStep("Select")}>Back</Button>
              <Button variant="primary" onClick={handleStartScrape}>Start Scrape</Button>
            </div>
          </div>
        );

      case "Progress":
        return (
          <div className="fade-in">
            <h5 className="mb-3">Step 5: Scraping Progress</h5>
            <h5>Status: {status}</h5>
            <ProgressBar now={progress} label={`${Math.round(progress)}%`} animated={isScraping} className="mb-4" />

            <Card>
              <Card.Header>Logs</Card.Header>
              <Card.Body style={{ height: "300px", overflowY: "auto", fontFamily: "monospace", fontSize: "0.9em" }}>
                {logs.map((log, i) => (
                  <div key={i}>{log}</div>
                ))}
                <div ref={logEndRef} />
              </Card.Body>
            </Card>

            {!isScraping && (
              <div className="d-flex justify-content-start mt-4">
                <Button variant="secondary" onClick={() => setStep("ScrapeConfig")}>Back to Config</Button>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <Container className="p-4" style={{ maxWidth: '800px' }}>
      <h1 className="mb-4">Dataset Generator Wizard</h1>
      {error && <Alert variant="warning" dismissible onClose={() => setError(null)}>{error}</Alert>}
      <Card>
        <Card.Body>
          {renderStep()}
        </Card.Body>
      </Card>
    </Container>
  );
}

export default App;
