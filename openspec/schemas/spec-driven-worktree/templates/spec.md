# <Capability> Specification

## Purpose

<!-- Include this section only for a new capability. Write 1-2 sentences of at least 50 characters describing the capability's purpose. Delete it for an existing capability delta. -->
<capability purpose>

## ADDED Requirements

<!-- Add requirements introduced by this change. Each block must contain SHALL/MUST text and at least one four-hash Scenario with WHEN and THEN bullets. -->

### Requirement: <requirement name>

The system SHALL <observable behavior>.

#### Scenario: <scenario name>

- **WHEN** <condition>
- **THEN** <observable result>

## MODIFIED Requirements

<!-- Copy the complete updated requirement block, including every existing scenario that remains valid. Do not omit unchanged scenarios. -->

### Requirement: <existing requirement name>

The system SHALL <complete updated behavior>.

#### Scenario: <existing or updated scenario name>

- **WHEN** <condition>
- **THEN** <observable result>

## REMOVED Requirements

<!-- Name each removed requirement and include both Reason and Migration. Remove this entire section when none apply. -->

### Requirement: <removed requirement name>

- **Reason**: <why the requirement is removed>
- **Migration**: <how callers or users move to the replacement, or why no migration is needed>

## RENAMED Requirements

<!-- Pair each rename with exact requirement headers. Do not also list the old or new name in another delta section. -->

- FROM: `### Requirement: <old requirement name>`
- TO: `### Requirement: <new requirement name>`
