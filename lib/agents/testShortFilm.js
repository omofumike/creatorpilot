import { runPipeline } from "./orchestratorAgent.js";

const topic = "Create a 10-minute short film about a woman returning to Lagos after many years abroad.";

console.log("==============================================");
console.log("SHORT FILM PIPELINE TEST");
console.log("==============================================");
console.log("Topic:", topic);
console.log("");

try {
  const result = await runPipeline(topic);

  console.log("");
  console.log("==============================================");
  console.log("RESULT");
  console.log("==============================================");

  console.log("success:", result?.success);
  console.log("failedStage:", result?.failedStage);
  console.log("error:", result?.error);
  console.log("step:", result?.step);
  console.log("productionType:", result?.productionType);

  console.log("");
  console.log("Stages:");
  console.log(JSON.stringify(result?.stages, null, 2));

  console.log("");
  console.log("Final Package:");
  console.log(JSON.stringify(result?.finalPackage, null, 2));

} catch (error) {
  console.error("");
  console.error("==============================================");
  console.error("UNEXPECTED ERROR");
  console.error("==============================================");
  console.error(error);
}
