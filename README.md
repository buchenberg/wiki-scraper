# Wikipedia Scraper & Dataset Generator

This tool scrapes Wikipedia articles and uses the DeepSeek API to generate high-quality instruction-response pairs for fine-tuning Large Language Models (LLMs).

## Features
- **Search & Scrape**: Fetches content from Wikipedia based on your query.
- **Intelligent Processing**: Uses DeepSeek (via OpenAI-compatible API) to extract Q&A pairs from the text.
- **Dataset Export**: Saves data in JSONL format, ready for fine-tuning.
- **Colab Ready**: Includes a Jupyter notebook for immediate fine-tuning in Google Colab.

## Prerequisites
- Python 3.8+
- A [DeepSeek API Key](https://platform.deepseek.com/)

## Installation

1.  **Clone/Open the project**:
    ```bash
    cd c:/Code/Personal/wiki-scraper
    ```

2.  **Create a virtual environment** (optional but recommended):
    ```bash
    python -m venv venv
    # Windows
    .\venv\Scripts\activate
    # Linux/Mac
    # source venv/bin/activate
    ```

3.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure API Key**:
    - Copy `example.env` to `.env`:
      ```bash
      cp example.env .env
      # Windows
      copy example.env .env
      ```
    - Open `.env` file.
    - Replace the placeholder with your actual key: `DEEPSEEK_API_KEY=sk-...`

## Usage

Run the `main.py` script to generate your dataset.

```bash
python main.py --query "Topic Name" --max-pages <number_of_pages>
```

### Examples

**Scrape 5 pages about Trees:**
```bash
python main.py --query "Trees" --max-pages 5
```

**Scrape 10 pages about Quantum Physics:**
```bash
python main.py --query "Quantum Physics" --max-pages 10
```

## Output

The script generates a file named `dataset.jsonl` in the current directory.
Format:
```json
{"instruction": "Question...", "response": "Answer..."}
{"instruction": "Question...", "response": "Answer..."}
```

## Fine-tuning

1.  **Upload to Colab**:
    - Upload the generated `dataset.jsonl` and the provided `fine_tune_notebook.ipynb` to [Google Colab](https://colab.research.google.com/).
2.  **Run the Notebook**:
    - Open `fine_tune_notebook.ipynb`.
    - Change the runtime to **T4 GPU** (Runtime > Change runtime type).
    - Run all cells to fine-tune a Llama-3 or Gemma model on your new dataset.
