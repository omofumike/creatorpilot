import { researchTopic } from './researchAgent.js';

async function runTest() {
  console.log('==================================================');
  console.log('Starting Research Agent Integration Test...');
  const topic = 'Latest trends in AI tools for solo video creators';
  console.log(`Researching: "${topic}"...\n`);

  try {
    const response = await researchTopic(topic);

    if (response.success) {
      console.log('--- Research Agent Success! ---');
      console.log(`Search ID:     ${response.searchMetadata.searchId}`);
      console.log(`Session ID:    ${response.searchMetadata.sessionId}`);
      console.log(`Total Sources: ${response.searchMetadata.totalResults}\n`);

      const brief = response.researchBrief;
      console.log('=== RESEARCH BRIEF ===');
      console.log(`Topic:   ${brief.topic}`);
      console.log(`Summary: \n${brief.summary}\n`);

      console.log('--- Key Facts ---');
      if (brief.keyFacts && brief.keyFacts.length > 0) {
        brief.keyFacts.forEach((fact, i) => console.log(`${i + 1}. ${fact}`));
      } else {
        console.log('(No key facts returned)');
      }
      console.log('');

      console.log('--- Statistics ---');
      if (brief.statistics && brief.statistics.length > 0) {
        brief.statistics.forEach((stat, i) => console.log(`${i + 1}. ${stat}`));
      } else {
        console.log('(No statistics returned)');
      }
      console.log('');

      console.log('--- Recent Developments ---');
      if (brief.recentDevelopments && brief.recentDevelopments.length > 0) {
        brief.recentDevelopments.forEach((dev, i) => console.log(`${i + 1}. ${dev}`));
      } else {
        console.log('(No recent developments returned)');
      }
      console.log('');

      console.log('--- Opportunities ---');
      if (brief.opportunities && brief.opportunities.length > 0) {
        brief.opportunities.forEach((opp, i) => console.log(`${i + 1}. ${opp}`));
      } else {
        console.log('(No opportunities returned)');
      }
      console.log('');

      console.log('--- Risks and Challenges ---');
      if (brief.risksChallenges && brief.risksChallenges.length > 0) {
        brief.risksChallenges.forEach((risk, i) => console.log(`${i + 1}. ${risk}`));
      } else {
        console.log('(No risks/challenges returned)');
      }
      console.log('');

      console.log('--- Important Context ---');
      if (brief.importantContext && brief.importantContext.length > 0) {
        brief.importantContext.forEach((ctx, i) => console.log(`${i + 1}. ${ctx}`));
      } else {
        console.log('(No important context returned)');
      }
      console.log('');

      console.log('--- Claims Requiring Verification ---');
      if (brief.claimsRequiringVerification && brief.claimsRequiringVerification.length > 0) {
        brief.claimsRequiringVerification.forEach((item, i) => {
          console.log(`${i + 1}. Claim:  ${item.claim}`);
          console.log(`   Reason: ${item.reason}`);
        });
      } else {
        console.log('(No claims requiring verification returned)');
      }
      console.log('');

      console.log('--- Sources Used ---');
      if (brief.sources && brief.sources.length > 0) {
        brief.sources.forEach((src, i) => {
          console.log(`${i + 1}. Title:     ${src.title}`);
          console.log(`   URL:       ${src.url}`);
          console.log(`   Relevance: ${src.relevance}`);
        });
      } else {
        console.log('(No sources returned)');
      }
      console.log('==================================================');

    } else {
      console.error('--- Research Agent Failed! ---');
      console.error(`Step failed: ${response.step}`);
      console.error(`Error:       ${response.error}`);
      if (response.rawResponse) {
        console.error(`Raw Response: ${response.rawResponse}`);
      }
      console.log('==================================================');
    }
  } catch (err) {
    console.error('--- Unexpected Test Failure ---');
    console.error(err);
    console.log('==================================================');
  }
}

runTest();
