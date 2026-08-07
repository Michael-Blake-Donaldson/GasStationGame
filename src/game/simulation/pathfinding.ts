import {
  buildOccupancyIndex,
  gridCellIndex,
  isGridCellInBounds,
  type GridCoordinate,
  type StationGridDefinition,
  type StationOccupancyState,
} from './grid';

export type StationPathFailureReason =
  | 'no-reachable-destination'
  | 'no-walkable-destination'
  | 'start-blocked'
  | 'start-out-of-bounds'
  | 'target-out-of-bounds';

export type StationPathResult =
  | {
      readonly destination: GridCoordinate;
      readonly ok: true;
      /** Excludes the start cell and includes the destination. */
      readonly path: readonly GridCoordinate[];
    }
  | { readonly ok: false; readonly reason: StationPathFailureReason };

const coordinateForIndex = (
  definition: StationGridDefinition,
  index: number,
): GridCoordinate => ({
  x: index % definition.width,
  z: Math.floor(index / definition.width),
});

const neighborIndexes = (
  definition: StationGridDefinition,
  coordinate: GridCoordinate,
): readonly number[] => {
  const candidates = [
    { x: coordinate.x, z: coordinate.z - 1 },
    { x: coordinate.x - 1, z: coordinate.z },
    { x: coordinate.x + 1, z: coordinate.z },
    { x: coordinate.x, z: coordinate.z + 1 },
  ];
  return candidates
    .filter((candidate) => isGridCellInBounds(definition, candidate))
    .map((candidate) => gridCellIndex(definition, candidate))
    .sort((left, right) => left - right);
};

const reconstructPath = (
  definition: StationGridDefinition,
  cameFrom: ReadonlyMap<number, number>,
  startIndex: number,
  destinationIndex: number,
): readonly GridCoordinate[] => {
  const reversed: GridCoordinate[] = [];
  let current = destinationIndex;
  while (current !== startIndex) {
    reversed.push(coordinateForIndex(definition, current));
    const previous = cameFrom.get(current);
    if (previous === undefined) {
      throw new RangeError('Path reconstruction reached a disconnected cell.');
    }
    current = previous;
  }
  return reversed.reverse();
};

export const findStationPath = (
  definition: StationGridDefinition,
  occupancy: StationOccupancyState,
  start: GridCoordinate,
  destinations: readonly GridCoordinate[],
): StationPathResult => {
  if (!isGridCellInBounds(definition, start)) {
    return { ok: false, reason: 'start-out-of-bounds' };
  }
  if (destinations.some((cell) => !isGridCellInBounds(definition, cell))) {
    return { ok: false, reason: 'target-out-of-bounds' };
  }

  const occupancyIndex = buildOccupancyIndex(definition, occupancy);
  const startIndex = gridCellIndex(definition, start);
  if (occupancyIndex.has(startIndex)) {
    return { ok: false, reason: 'start-blocked' };
  }

  const destinationIndexes = [
    ...new Set(destinations.map((cell) => gridCellIndex(definition, cell))),
  ]
    .filter((index) => !occupancyIndex.has(index))
    .sort((left, right) => left - right);
  if (destinationIndexes.length === 0) {
    return { ok: false, reason: 'no-walkable-destination' };
  }
  if (destinationIndexes.includes(startIndex)) {
    return { destination: { ...start }, ok: true, path: [] };
  }

  const destinationsSet = new Set(destinationIndexes);
  const queue: number[] = [startIndex];
  let queueIndex = 0;
  const distance = new Map<number, number>([[startIndex, 0]]);
  const cameFrom = new Map<number, number>();
  let shortestDestinationDistance: number | undefined;
  const reachedDestinations: number[] = [];

  while (queueIndex < queue.length) {
    const currentIndex = queue[queueIndex];
    queueIndex += 1;
    if (currentIndex === undefined) break;
    const currentDistance = distance.get(currentIndex);
    if (currentDistance === undefined) {
      throw new RangeError('Path search queue lost its distance record.');
    }
    if (
      shortestDestinationDistance !== undefined &&
      currentDistance > shortestDestinationDistance
    ) {
      break;
    }
    if (destinationsSet.has(currentIndex)) {
      shortestDestinationDistance = currentDistance;
      reachedDestinations.push(currentIndex);
      continue;
    }

    const coordinate = coordinateForIndex(definition, currentIndex);
    for (const neighbor of neighborIndexes(definition, coordinate)) {
      if (occupancyIndex.has(neighbor) || distance.has(neighbor)) continue;
      distance.set(neighbor, currentDistance + 1);
      cameFrom.set(neighbor, currentIndex);
      queue.push(neighbor);
    }
  }

  const destinationIndex = reachedDestinations.sort((left, right) => left - right)[0];
  if (destinationIndex === undefined) {
    return { ok: false, reason: 'no-reachable-destination' };
  }
  return {
    destination: coordinateForIndex(definition, destinationIndex),
    ok: true,
    path: reconstructPath(definition, cameFrom, startIndex, destinationIndex),
  };
};
