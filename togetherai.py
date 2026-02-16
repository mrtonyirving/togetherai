from together import AsyncTogether
from dotenv import load_dotenv
import os
import asyncio
from datetime import datetime
import json
import re

load_dotenv()  # Load environment variables from .env file

# Configuration
MODEL_NAME = "Qwen/Qwen3-235B-A22B-fp8-tput"
CONCURRENT_REQUESTS = 20
MAX_RETRIES = 3
TOTAL_REQUESTS = 100
REPORT_DIR = "report.folder"

async def make_request(client, request_num, semaphore):
    async with semaphore:
        for attempt in range(MAX_RETRIES):
            try:
                start_time = datetime.now()
                print(f"Starting request {request_num} at {start_time.strftime('%H:%M:%S.%f')[:-3]}")
                response = await client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=[
                      {
                        "role": "user",
                        "content": """--- SYSTEM ---
You are an expert at extracting person names from legal and corporate documents.
Analyze ONLY the provided page and extract ALL person names according to the schema.
Include every person name you see, regardless of role, ownership, or context.
You are given the page with block IDs, always refer back to these sources in the block_sources field.
Use the block IDs exactly as shown after the === BLOCK ... === markers.
For each person, include every block ID on this page where their name appears in block_sources.
If you are unsure about a block source, return an empty array for that person.
Return only people mentioned on this page; do not infer from other pages.
Populate name_blocks with every block ID on this page that contains at least one persons name.
--- USER ---
=== PAGE 1 ===

=== BLOCK block_1_1 ===

PAPEL EXCLUSIVO PAFA DOCUMENTOS NOTARIALES

=== BLOCK block_1_2 ===

09/ 202

=== BLOCK block_1_3 ===

G I 37s6gl_9

=== BLOCK block_1_4 ===

ESCRITURA DE CONSTITUCTON DE l\LA VINA DEL SENOR,

=== BLOCK block_1_5 ===

s.L,.

=== BLOCK block_1_6 ===

NÚMERO DoS MIL QUIN]ENTOS CUARENTA Y NUEVE

=== BLOCK block_1_7 ===

En CADIZ, mi residencia, a veintidós de diclem-

=== BLOCK block_1_8 ===

bre de dos mif veintiuno.

=== BLOCK block_1_9 ===

Ante ñí, IÑrco FERNAITDEZ DE CORDOVA CLAROS, No-

=== BLOCK block_1_10 ===

tario del Colegio Notarial de Andalucia,

=== BLOCK block_1_11 ===

COMPARECEN

=== BLOCK block_1_12 ===

DON ANTONIO HERNANDEZ-RODICIO ROMERO, nacido el

=== BLOCK block_1_13 ===

dia 28 de octubre de L966, casado en régimen legal

=== BLOCK block_1_14 ===

Teresa Mateos

=== BLOCK block_1_15 ===

supletorio de gananciales con doña

=== BLOCK block_1_16 ===

Cabrera, periodista, con domicilio

=== BLOCK block_1_17 ===

Doctor Herrera Quevedo, número 5,

=== BLOCK block_1_18 ===

DON

=== BLOCK block_1_19 ===

en Cádí2, cal-le

=== BLOCK block_1_20 ===

2o -D, con D. N. I

=== BLOCK block_1_21 ===

número 31,.248 .602-C.

=== BLOCK block_1_22 ===

FERNANDO JOSE, conocido solo por FERNANDO,

=== BLOCK block_1_23 ===

CABRALES, nacido el dia 7 de diciembre de

=== BLOCK block_1_24 ===

separado judicialmente, periodista,

=== BLOCK block_1_25 ===

con domi-

=== BLOCK block_1_26 ===

PEREZ

=== BLOCK block_1_27 ===

7965,

=== BLOCK block_1_28 ===

cil- io

=== BLOCK block_1_29 ===

con D

=== BLOCK block_1_30 ===

en Cádí2, calle Ancha, número 23, 2 derecha,

=== BLOCK block_1_31 ===

N. I número 37.246.899-L.

=== BLOCK block_1_32 ===

*@*

=== BLOCK block_1_33 ===

wffi

=== BLOCK block_1_34 ===

IGO FERNÁNDEZ DE CÓRDOVA CLAROS

=== BLOCK block_1_35 ===

Notario

=== BLOCK block_1_36 ===

Avenida cuatro de dicierrbre de 1977 , no26, bajo izqda

=== BLOCK block_1_37 ===

Tlf. 956 294 661 Fax. 956 272 567

=== BLOCK block_1_38 ===

I1006 CADTZ

=== BLOCK block_1_39 ===

Les identifico por sus documentos de identidad
--- END LLM1 INPUT ---"""
                      }
                    ]
                )
                end_time = datetime.now()
                duration = (end_time - start_time).total_seconds()

                response_text = response.choices[0].message.content

                result = {
                    'request_num': request_num,
                    'response': response_text,
                    'duration': duration,
                    'timestamp': start_time.isoformat(),
                    'status': 'success'
                }
                print(f"Request {request_num}: {response_text[:100]}...")
                return result
            except Exception as e:
                if attempt < MAX_RETRIES - 1:
                    wait_time = 2 ** attempt  # Exponential backoff: 1s, 2s, 4s
                    print(f"Request {request_num} failed (attempt {attempt + 1}/{MAX_RETRIES}), retrying in {wait_time}s...")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"Request {request_num} failed after {MAX_RETRIES} attempts: {str(e)}")
                    return {
                        'request_num': request_num,
                        'response': None,
                        'duration': 0,
                        'timestamp': datetime.now().isoformat(),
                        'status': 'failed',
                        'error': str(e)
                    }

async def main():
    client = AsyncTogether()
    os.makedirs(REPORT_DIR, exist_ok=True)

    semaphore = asyncio.Semaphore(CONCURRENT_REQUESTS)
    start_time = datetime.now()

    tasks = [make_request(client, i, semaphore) for i in range(1, TOTAL_REQUESTS + 1)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    end_time = datetime.now()
    total_duration = (end_time - start_time).total_seconds()

    # Filter out exceptions and count successes/failures
    valid_results = [r for r in results if isinstance(r, dict)]
    successful = [r for r in valid_results if r['status'] == 'success']
    failed = [r for r in valid_results if r['status'] == 'failed']

    # Count names for each successful result after all calls are done
    for result in successful:
        name_count = 0
        response_text = result.get('response', '')
        if response_text:
            try:
                # Remove markdown code blocks if present
                cleaned_text = re.sub(r'^```(?:json)?\s*\n', '', response_text)
                cleaned_text = re.sub(r'\n```\s*$', '', cleaned_text)

                # Try to parse as JSON and count people/names
                response_json = json.loads(cleaned_text)
                if isinstance(response_json, dict):
                    if 'people' in response_json:
                        name_count = len(response_json['people'])
                    elif 'names' in response_json:
                        name_count = len(response_json['names'])
                    elif 'persons' in response_json:
                        name_count = len(response_json['persons'])
                elif isinstance(response_json, list):
                    name_count = len(response_json)
            except Exception as e:
                # If JSON parsing fails, try counting name patterns
                print(f"Warning: Could not parse JSON for request {result['request_num']}: {str(e)}")

        result['name_count'] = name_count

    # Generate report
    report_path = os.path.join(REPORT_DIR, f"api_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt")
    with open(report_path, 'w') as f:
        f.write("Together AI API Test Report\n")
        f.write("=" * 80 + "\n\n")
        f.write(f"Test Started: {start_time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Test Completed: {end_time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Total Duration: {total_duration:.2f} seconds\n")
        f.write(f"Total Requests: {len(valid_results)}\n")
        f.write(f"Successful: {len(successful)}\n")
        f.write(f"Failed: {len(failed)}\n")
        if successful:
            f.write(f"Average Response Time: {sum(r['duration'] for r in successful) / len(successful):.2f} seconds\n")
        f.write(f"Model: {MODEL_NAME}\n")
        f.write("\n" + "=" * 80 + "\n\n")

        f.write("Individual Request Results:\n")
        f.write("-" * 80 + "\n\n")

        for result in valid_results:
            f.write(f"Request #{result['request_num']}\n")
            f.write(f"  Status: {result['status']}\n")
            f.write(f"  Timestamp: {result['timestamp']}\n")
            if result['status'] == 'success':
                f.write(f"  Duration: {result['duration']:.2f}s\n")
                f.write(f"  Names Extracted: {result.get('name_count', 0)}\n")
                f.write(f"  Response: {result['response']}\n")
            else:
                f.write(f"  Error: {result.get('error', 'Unknown error')}\n")
            f.write("\n")

        # Add summary table at the end
        f.write("\n" + "=" * 80 + "\n\n")
        f.write("Name Extraction Summary Table\n")
        f.write("-" * 80 + "\n\n")
        f.write(f"{'Request #':<12} {'Status':<12} {'Names Count':<15} {'Duration (s)':<15}\n")
        f.write("-" * 80 + "\n")

        for result in sorted(valid_results, key=lambda x: x['request_num']):
            status = result['status']
            name_count = result.get('name_count', 0)
            duration = result.get('duration', 0)
            f.write(f"{result['request_num']:<12} {status:<12} {name_count:<15} {duration:<15.2f}\n")

        f.write("-" * 80 + "\n")
        total_names = sum(r.get('name_count', 0) for r in successful)
        f.write(f"{'TOTAL':<12} {'':<12} {total_names:<15} {'':<15}\n")
        f.write(f"\nAverage names per successful request: {total_names / len(successful) if successful else 0:.2f}\n")

    print(f"\nReport generated: {report_path}")
    print(f"Summary: {len(successful)} successful, {len(failed)} failed out of {len(valid_results)} total")
    print(f"Total names extracted: {sum(r.get('name_count', 0) for r in successful)}")

if __name__ == "__main__":
    asyncio.run(main())