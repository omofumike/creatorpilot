import { parallelSearch } from './parallelSearch.js';

async function runTest() {
  console.log('Starting Parallel Search Test...');
  const topic = 'AI and education in Africa';
  console.log(`Searching for: "${topic}"...\n`);

  const response = await parallelSearch(topic);

  if (response.success) {
    console.log('--- Search Successful ---');
    console.log(`Search ID: ${response.searchId}`);
    console.log(`Session ID: ${response.sessionId}`);
    console.log(`Total Results: ${response.results.length}\n`);

    response.results.forEach((result, idx) => {
      console.log(`Result #${idx + 1}`);
      console.log(`Title:  ${result.title}`);
      console.log(`URL:    ${result.url}`);
      console.log(`Date:   ${result.publishDate || 'N/A'}`);
      console.log('Excerpts:');
      if (result.excerpts && result.excerpts.length > 0) {
        result.excerpts.forEach((excerpt) => {
          console.log(`  - ${excerpt}`);
        });
      } else {
        console.log('  (No excerpts)');
      }
      console.log('-------------------------\n');
    });
  } else {
    console.error('--- Search Failed ---');
    console.error(`Error: ${response.error}`);
  }
}

runTest();
