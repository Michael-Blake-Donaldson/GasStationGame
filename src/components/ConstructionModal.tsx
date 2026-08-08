import { useMemo, useState } from 'react';
import { greatPlainsSimulationContext } from '../game/scenarios/greatPlains';
import {
  evaluateConstructionPlacement,
  type ConstructionIssue,
  type ConstructionPlacementRequest,
} from '../game/simulation/construction';
import type { QuarterTurn } from '../game/simulation/grid';
import type { SimulationState } from '../game/simulation/types';
import { Modal } from './Modal';

interface ConstructionModalProps {
  readonly isOpen: boolean;
  readonly isRecoveryReady: boolean;
  readonly onClose: () => void;
  readonly onPlaceConstruction: (request: ConstructionPlacementRequest) => void;
  readonly simulation: SimulationState;
}

const ROTATIONS: readonly QuarterTurn[] = [0, 1, 2, 3];

const describeIssue = (issue: ConstructionIssue): string => {
  const cells =
    issue.cells.length === 0
      ? ''
      : ` at ${issue.cells.map(({ x, z }) => `(${String(x)}, ${String(z)})`).join(', ')}`;
  switch (issue.reason) {
    case 'construction-closed':
      return 'Construction is available during day operations.';
    case 'insufficient-cash':
    case 'insufficient-scrap':
      return `Needs ${String(issue.required ?? 0)} ${issue.reason === 'insufficient-cash' ? 'cash' : 'scrap'}; ${String(issue.available ?? 0)} available.`;
    case 'employee-cell-occupied':
      return `Crew ${issue.employeeIds?.join(', ') ?? 'member'} occupies the footprint${cells}.`;
    case 'active-route-obstructed':
      return `Active route for ${issue.employeeIds?.join(', ') ?? 'crew'} crosses the footprint${cells}.`;
    case 'authored-plot-occupied':
      return `Plot ${issue.plotId ?? ''} is already occupied.`;
    case 'authored-plot-reserved':
      return `Footprint enters reserved plot ${issue.plotId ?? ''}${cells}.`;
    case 'cell-occupied':
      return `Footprint overlaps ${issue.conflictingOccupantIds?.join(', ') ?? 'a structure'}${cells}.`;
    case 'out-of-bounds':
      return `Footprint leaves the station grid${cells}.`;
    case 'cell-not-buildable':
      return `Cell is outside the flexible build area${cells}.`;
    case 'facility-not-allowed':
      return `This facility is not allowed on plot ${issue.plotId ?? ''}.`;
    case 'authored-plot-not-found':
      return 'The selected authored plot does not exist.';
    case 'rotation-not-allowed':
      return 'That rotation is not allowed for this blueprint.';
    case 'placement-kind-mismatch':
      return 'The selected placement mode does not match the blueprint.';
    case 'blueprint-not-found':
      return 'The selected blueprint does not exist.';
    case 'construction-sequence-exhausted':
      return 'The construction identity sequence is exhausted.';
    case 'invalid-candidate':
    case 'occupant-id-already-used':
      return 'The placement candidate is invalid.';
  }
};

export const ConstructionModal = ({
  isOpen,
  isRecoveryReady,
  onClose,
  onPlaceConstruction,
  simulation,
}: ConstructionModalProps) => {
  const definitions = greatPlainsSimulationContext.scenario.construction;
  const grid = greatPlainsSimulationContext.scenario.stationGridDefinition;
  const [blueprintId, setBlueprintId] = useState('wall');
  const [originX, setOriginX] = useState(0);
  const [originZ, setOriginZ] = useState(4);
  const [rotation, setRotation] = useState<QuarterTurn>(0);
  const [plotId, setPlotId] = useState('garage-plot');
  const blueprint = definitions.find(({ id }) => id === blueprintId);
  const request = useMemo<ConstructionPlacementRequest>(
    () =>
      blueprint?.placement === 'authored-plot'
        ? {
            blueprintId,
            placement: { kind: 'authored-plot', plotId },
          }
        : {
            blueprintId,
            placement: {
              kind: 'flexible',
              origin: { x: originX, z: originZ },
              rotation,
            },
          },
    [blueprint?.placement, blueprintId, originX, originZ, plotId, rotation],
  );
  const evaluation = evaluateConstructionPlacement(
    simulation,
    greatPlainsSimulationContext,
    request,
  );
  const compatiblePlots =
    blueprint?.placement === 'authored-plot'
      ? grid.authoredPlots.filter((plot) =>
          plot.allowedFacilityIds.includes(blueprint.facilityId),
        )
      : [];
  const placed = simulation.stationOccupancy.occupants.filter(({ id }) =>
    id.startsWith('built-'),
  );

  return (
    <Modal
      eyebrow="Property plan / construction"
      isOpen={isOpen}
      onClose={onClose}
      title="Build station"
    >
      <div className="construction-layout">
        <section className="construction-palette" aria-label="Blueprints">
          <div className="operations-heading">
            <div>
              <span className="panel-kicker">Blueprint catalog</span>
              <h3>Choose a station shell</h3>
            </div>
            <span>{definitions.length} plans</span>
          </div>
          <div className="construction-blueprints">
            {definitions.map((definition) => (
              <button
                aria-pressed={definition.id === blueprintId}
                className={definition.id === blueprintId ? 'is-selected' : ''}
                key={definition.id}
                onClick={() => {
                  setBlueprintId(definition.id);
                  if (definition.placement === 'authored-plot') {
                    const compatible = grid.authoredPlots.find((candidate) =>
                      candidate.allowedFacilityIds.includes(definition.facilityId),
                    );
                    if (compatible !== undefined) setPlotId(compatible.id);
                  }
                }}
                type="button"
              >
                <strong>{definition.displayName}</strong>
                <span>
                  ${definition.cost.cash} · {definition.cost.scrap} scrap
                </span>
                <small>
                  {definition.placement === 'authored-plot'
                    ? 'Authored facility plot'
                    : `${String(definition.footprint.width)}×${String(definition.footprint.height)} flexible footprint`}
                </small>
              </button>
            ))}
          </div>
        </section>

        <section className="construction-placement" aria-label="Placement preview">
          <div className="operations-heading">
            <div>
              <span className="panel-kicker">Placement preview</span>
              <h3>{blueprint?.displayName ?? 'Unknown blueprint'}</h3>
            </div>
            <span>{evaluation.ok ? 'Valid' : 'Blocked'}</span>
          </div>

          {blueprint?.placement === 'authored-plot' ? (
            <label className="construction-field">
              <span>Facility plot</span>
              <select
                onChange={(event) => setPlotId(event.currentTarget.value)}
                value={plotId}
              >
                {compatiblePlots.map((plot) => (
                  <option key={plot.id} value={plot.id}>
                    {plot.id.replaceAll('-', ' ')}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="construction-coordinate-grid">
              <label className="construction-field">
                <span>X cell</span>
                <input
                  inputMode="numeric"
                  max={grid.width - 1}
                  min={0}
                  onChange={(event) => setOriginX(Number(event.currentTarget.value))}
                  type="number"
                  value={originX}
                />
              </label>
              <label className="construction-field">
                <span>Z cell</span>
                <input
                  inputMode="numeric"
                  max={grid.height - 1}
                  min={0}
                  onChange={(event) => setOriginZ(Number(event.currentTarget.value))}
                  type="number"
                  value={originZ}
                />
              </label>
              <fieldset className="construction-rotation">
                <legend>Rotation</legend>
                <div>
                  {ROTATIONS.map((turn) => (
                    <button
                      aria-pressed={rotation === turn}
                      key={turn}
                      onClick={() => setRotation(turn)}
                      type="button"
                    >
                      {turn * 90}°
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>
          )}

          <div className="construction-facts">
            <span>
              Cost <strong>${evaluation.cost?.cash ?? 0}</strong> +{' '}
              <strong>{evaluation.cost?.scrap ?? 0} scrap</strong>
            </span>
            <span>
              Cells <strong>{evaluation.cells.length}</strong>
            </span>
          </div>
          <p className="construction-cells">
            {evaluation.cells.length === 0
              ? 'No affected cells.'
              : evaluation.cells
                  .map(({ x, z }) => `(${String(x)}, ${String(z)})`)
                  .join(' · ')}
          </p>

          <div aria-live="polite" className="construction-feedback" role="status">
            {evaluation.ok ? (
              <p>Placement is clear and affordable.</p>
            ) : (
              <ul>
                {evaluation.issues.map((issue, index) => (
                  <li key={`${issue.reason}-${String(index)}`}>
                    {describeIssue(issue)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            className="primary-action construction-confirm"
            disabled={!isRecoveryReady || !evaluation.ok}
            onClick={() => onPlaceConstruction(request)}
            type="button"
          >
            Place {blueprint?.displayName ?? 'construction'}
          </button>
        </section>
      </div>

      <section className="constructed-list">
        <div className="operations-heading">
          <div>
            <span className="panel-kicker">Built this run</span>
            <h3>Construction shells</h3>
          </div>
          <span>{placed.length}</span>
        </div>
        {placed.length === 0 ? (
          <p>
            No new shells placed. Their later power, defense, and repair functions are
            tracked in future milestones.
          </p>
        ) : (
          <ul>
            {placed.map((occupant) => (
              <li key={occupant.id}>
                <strong>{occupant.id.replaceAll('-', ' ')}</strong>
                <span>
                  {occupant.placement === 'authored-plot'
                    ? occupant.plotId
                    : `cell ${String(occupant.origin.x)}, ${String(occupant.origin.z)} · ${String(occupant.rotation * 90)}°`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Modal>
  );
};
