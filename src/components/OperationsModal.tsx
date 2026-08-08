import { greatPlainsRegion } from '../content/regions/greatPlains';
import type { SimulationState } from '../game/simulation/types';
import { Modal } from './Modal';

type RetailProduct = 'food' | 'fuel';

interface OperationsModalProps {
  readonly isOpen: boolean;
  readonly isRecoveryReady: boolean;
  readonly onAssignJob: (employeeId: string, jobId: string) => void;
  readonly onCancelJob: (employeeId: string) => void;
  readonly onClose: () => void;
  readonly onOrderInventory: (product: RetailProduct, quantity: number) => void;
  readonly onSetRetailPrice: (product: RetailProduct, unitPrice: number) => void;
  readonly simulation: SimulationState;
}

const PRODUCTS: readonly RetailProduct[] = ['fuel', 'food'];
const PRODUCT_LABEL: Record<RetailProduct, string> = {
  food: 'Counter food',
  fuel: 'Pump fuel',
};
const JOBS = [
  { id: 'staff-pumps', label: 'Pumps' },
  { id: 'staff-checkout', label: 'Checkout' },
] as const;

const titleCaseStage = (stage: string): string =>
  stage
    .split('-')
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ');

export const OperationsModal = ({
  isOpen,
  isRecoveryReady,
  onAssignJob,
  onCancelJob,
  onClose,
  onOrderInventory,
  onSetRetailPrice,
  simulation,
}: OperationsModalProps) => {
  const isDayOpen = simulation.phase === 'day' && isRecoveryReady;
  const occupiedJobIds = new Set(
    simulation.employees.flatMap((employee) =>
      employee.activity.status === 'idle' ? [] : [employee.activity.jobId],
    ),
  );
  const pumpCustomers = simulation.business.activeCustomers.filter((customer) =>
    customer.stage.type.startsWith('pump-'),
  ).length;
  const checkoutCustomers = simulation.business.activeCustomers.filter((customer) =>
    customer.stage.type.startsWith('checkout-'),
  ).length;

  return (
    <Modal
      eyebrow="Day shift / live controls"
      isOpen={isOpen}
      onClose={onClose}
      title="Station operations"
    >
      <div className="operations-summary" aria-label="Customer service summary">
        <div>
          <span>Pump line</span>
          <strong>{pumpCustomers}</strong>
        </div>
        <div>
          <span>Checkout line</span>
          <strong>{checkoutCustomers}</strong>
        </div>
        <div>
          <span>Served total</span>
          <strong>{simulation.business.completedCustomerCount}</strong>
        </div>
      </div>

      {isDayOpen ? null : (
        <p className="operations-closed" role="note">
          {isRecoveryReady
            ? 'Retail controls reopen during day operations.'
            : 'Controls unlock after recovery checks finish.'}
        </p>
      )}

      <section className="operations-section" aria-labelledby="retail-heading">
        <div className="operations-heading">
          <div>
            <span className="panel-kicker">Prices and stock</span>
            <h3 id="retail-heading">Retail desk</h3>
          </div>
          <span>Cash ${simulation.resources.cash}</span>
        </div>
        <div className="retail-grid">
          {PRODUCTS.map((product) => {
            const definition = greatPlainsRegion.business.products[product];
            const price = simulation.business.prices[product];
            const orderCost = definition.wholesaleUnitCost * 10;
            return (
              <article className="retail-card" data-product={product} key={product}>
                <div className="retail-card-title">
                  <div>
                    <span>{PRODUCT_LABEL[product]}</span>
                    <strong>{simulation.resources[product]} units</strong>
                  </div>
                  <small>${definition.wholesaleUnitCost} wholesale</small>
                </div>
                <div
                  className="price-control"
                  role="group"
                  aria-label={`${product} price`}
                >
                  <button
                    aria-label={`Decrease ${product} price`}
                    disabled={!isDayOpen || price <= 1}
                    onClick={() => onSetRetailPrice(product, price - 1)}
                    type="button"
                  >
                    -
                  </button>
                  <div>
                    <span>Unit price</span>
                    <strong>${price}</strong>
                  </div>
                  <button
                    aria-label={`Increase ${product} price`}
                    disabled={!isDayOpen || price >= definition.maximumUnitPrice}
                    onClick={() => onSetRetailPrice(product, price + 1)}
                    type="button"
                  >
                    +
                  </button>
                </div>
                <button
                  aria-label={`Order 10 ${product} for $${String(orderCost)}`}
                  className="order-button"
                  disabled={!isDayOpen || simulation.resources.cash < orderCost}
                  onClick={() => onOrderInventory(product, 10)}
                  type="button"
                >
                  Order 10 / ${orderCost}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="operations-section" aria-labelledby="staffing-heading">
        <div className="operations-heading">
          <div>
            <span className="panel-kicker">Workstation coverage</span>
            <h3 id="staffing-heading">Crew assignments</h3>
          </div>
          <span>One worker per station</span>
        </div>
        <div className="assignment-list">
          {simulation.employees.map((employee) => {
            const activity = employee.activity;
            return (
              <article className="assignment-card" key={employee.id}>
                <div className="assignment-copy">
                  <strong>{employee.name}</strong>
                  <span>
                    {activity.status === 'idle'
                      ? 'Available'
                      : titleCaseStage(`${activity.status}-${activity.jobId}`)}
                  </span>
                </div>
                <div className="assignment-actions">
                  {activity.status === 'idle' ? (
                    JOBS.map((job) => (
                      <button
                        aria-label={`Assign ${employee.name} to ${job.label.toLowerCase()}`}
                        disabled={!isDayOpen || occupiedJobIds.has(job.id)}
                        key={job.id}
                        onClick={() => onAssignJob(employee.id, job.id)}
                        type="button"
                      >
                        {job.label}
                      </button>
                    ))
                  ) : (
                    <button
                      aria-label={`Clear ${employee.name}'s assignment`}
                      className="cancel-button"
                      disabled={!isRecoveryReady}
                      onClick={() => onCancelJob(employee.id)}
                      type="button"
                    >
                      Clear assignment
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </Modal>
  );
};
