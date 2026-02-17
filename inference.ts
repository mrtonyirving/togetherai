import {
  Triplet,
  TripletNode,
  TripletRelation,
} from "@/features/horizon/inference/triplets";
import {
  isSubtopics,
  topicMappings,
  statutoryViolations,
} from "./regulatory-kb/library/taxonomy/generated/relations.generated";

type JulgranNotation = string;

const Relation = {
  /** Sanktionsbeslut broke a rule */
  Statutory_violation_of: (origin: string, destination: string) =>
    Triplet.create(
      TripletNode.create(["Reference"], { address: origin }),
      TripletRelation.create("HAS_BROKEN_RULE"),
      TripletNode.create(["Reference"], { address: destination })
    ),
  TopicMappings: (
    topic: string,
    addresses: JulgranNotation | JulgranNotation[]
  ) =>
    asList(addresses).map((address) =>
      Triplet.create(
        TripletNode.create(["Reference"], { address }),
        TripletRelation.create("HAS_TOPIC"),
        TripletNode.create(["Topic"], { concept: topic })
      )
    ),
  IsSubtopic: (subTopic: string, parentTopic: string) =>
    Triplet.create(
      TripletNode.create(["Topic"], { address: subTopic }),
      TripletRelation.create("IS_SUBTOPIC"),
      TripletNode.create(["Topic"], { address: parentTopic })
    ),
  IsTopic: (topic: string, addresses: JulgranNotation | JulgranNotation[]) =>
    asList(addresses).map((address) =>
      Triplet.create(
        TripletNode.create(["Reference"], { address }),
        TripletRelation.create("HAS_TOPIC"),
        TripletNode.create(["Topic"], { concept: topic })
      )
    ),
};

const relations: Triplet[] = [
  ...isSubtopics.map(({ subtopic, parentTopic }) =>
    Relation.IsSubtopic(subtopic, parentTopic)
  ),
  ...topicMappings.flatMap(({ topic, addresses }) =>
    Relation.TopicMappings(topic, addresses)
  ),
  ...statutoryViolations.map(({ actionReference, statutoryReference }) =>
    Relation.Statutory_violation_of(actionReference, statutoryReference)
  ),
];

/**
 * Will create a query that merges the hardcoded triplets into the database, avoiding creating new ones
 */
export function getHardCodedInferenceQuery(): string {
  return relations
    .map((triplet) => `MERGE p=${triplet.getCypherTriplet()} RETURN p;`)
    .join("\n");
}

function asList<T>(value: T | T[]): T[] {
  return Array.isArray(value) ? value : [value];
}
