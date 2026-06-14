"""All Pydantic models for RetailFlow AI."""
from datetime import datetime, timezone
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional, List
from enum import Enum


# === ENUMS ===
class UserRole(str, Enum):
    PLATFORM_ADMIN = "platform_admin"
    BUSINESS_ADMIN = "business_admin"
    OUTLET_MANAGER = "outlet_manager"
    CASHIER = "cashier"


class SubscriptionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    SUSPENDED = "suspended"
    EXPIRED = "expired"


class PlanTier(str, Enum):
    STARTER = "starter"
    GROWTH = "growth"
    ENTERPRISE = "enterprise"


class ExpenseStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class ProductStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class PaymentMethod(str, Enum):
    CASH = "cash"
    UPI = "upi"
    CARD = "card"
    WALLET = "wallet"
    SPLIT = "split"


# === AUTH ===
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RegisterBusinessRequest(BaseModel):
    business_name: str
    business_type: str
    owner_name: str
    email: EmailStr
    phone: str
    password: str
    plan: PlanTier = PlanTier.STARTER


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    password: str
    role: UserRole
    outlet_id: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[UserRole] = None
    outlet_id: Optional[str] = None
    active: Optional[bool] = None
    role_id: Optional[str] = None
    reports_to_user_id: Optional[str] = None
    outlet_ids: Optional[List[str]] = None
    employee_status: Optional[str] = None


# === BUSINESS ===
class BusinessUpdate(BaseModel):
    business_name: Optional[str] = None
    business_type: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gst_number: Optional[str] = None
    logo_url: Optional[str] = None
    currency: Optional[str] = None


# === OUTLET ===
class OutletCreate(BaseModel):
    name: str
    address: str
    phone: Optional[str] = None
    manager_id: Optional[str] = None
    is_warehouse: bool = False


class OutletUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    manager_id: Optional[str] = None
    active: Optional[bool] = None
    is_warehouse: Optional[bool] = None


# === PRODUCT ===
class ProductSupplierLink(BaseModel):
    supplier_id: str


class ProductCreate(BaseModel):
    name: str
    sku: str
    barcode: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    supplier_ids: List[str] = []
    cost_price: float = 0.0
    selling_price: float
    tax_percent: float = 0.0
    reward_points: int = 0
    min_stock: int = 0
    unit: str = "pcs"
    image_url: Optional[str] = None
    outlet_id: Optional[str] = None
    outlet_ids: Optional[List[str]] = None
    initial_stock: int = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    supplier_ids: Optional[List[str]] = None
    cost_price: Optional[float] = None
    selling_price: Optional[float] = None
    tax_percent: Optional[float] = None
    reward_points: Optional[int] = None
    min_stock: Optional[int] = None
    unit: Optional[str] = None
    image_url: Optional[str] = None
    active: Optional[bool] = None
    outlet_ids: Optional[List[str]] = None
    initial_stock: Optional[int] = None


class ProductAssignOutlets(BaseModel):
    outlet_ids: List[str]
    initial_stock: int = 0


# === INVENTORY ===
class InventoryTxnCreate(BaseModel):
    product_id: str
    outlet_id: str
    type: str  # stock_in, stock_out, adjustment, transfer
    quantity: int
    note: Optional[str] = None
    to_outlet_id: Optional[str] = None  # for transfer
    supplier_id: Optional[str] = None  # owner stock-in → auto PO
    cost_price: Optional[float] = None  # unit cost for owner stock-in PO


# === CUSTOMER ===
class CustomerCreate(BaseModel):
    name: str
    phone: str
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    location: Optional[str] = None
    outlet_id: Optional[str] = None
    dob: Optional[str] = None


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    location: Optional[str] = None
    dob: Optional[str] = None


# === BILL / POS ===
class BillItemCreate(BaseModel):
    product_id: str
    quantity: int
    discount: float = 0.0


class BillCreate(BaseModel):
    outlet_id: str
    customer_id: Optional[str] = None
    items: List[BillItemCreate]
    discount_total: float = 0.0
    payment_method: PaymentMethod = PaymentMethod.CASH
    payment_splits: Optional[List[dict]] = None  # [{method, amount}]
    redeem_points: int = 0
    note: Optional[str] = None


# === SUPPLIER ===
class SupplierCreate(BaseModel):
    name: str
    contact: str
    email: Optional[EmailStr] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    contact: Optional[str] = None
    email: Optional[EmailStr] = None
    gst_number: Optional[str] = None
    address: Optional[str] = None


# === PURCHASE ORDER ===
class POItemCreate(BaseModel):
    product_id: str
    quantity: int
    cost_price: float


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    outlet_id: str
    items: List[POItemCreate]
    note: Optional[str] = None


class StockRequestItemCreate(BaseModel):
    product_id: str
    quantity: int


class StockRequestCreate(BaseModel):
    items: List[StockRequestItemCreate]
    note: Optional[str] = None


class PurchaseOrderApprove(BaseModel):
    fulfillment_source: str = "supplier"  # supplier | warehouse
    supplier_id: Optional[str] = None
    fulfill_outlet_id: str
    warehouse_id: Optional[str] = None
    shipping_charge: float = 0
    center_charge: float = 0
    items: List[POItemCreate]


class PurchaseOrderUpdate(BaseModel):
    status: str  # pending, received, cancelled, rejected


# === EXPENSE ===
class ExpenseCreate(BaseModel):
    outlet_id: str
    category: str  # staff, operations, inventory, marketing, misc
    subcategory: Optional[str] = None
    amount: float
    description: str
    expense_date: Optional[str] = None
    attachment_url: Optional[str] = None
    employee_id: Optional[str] = None


class ExpenseApprove(BaseModel):
    action: str  # approve or reject
    note: Optional[str] = None


class ProductApprove(BaseModel):
    action: str  # approve or reject
    note: Optional[str] = None
    outlet_ids: Optional[List[str]] = None


# === TAX CONFIG ===
class TaxConfigCreate(BaseModel):
    name: str
    rate: float
    type: str  # CGST, SGST, IGST


# === REWARD CONFIG ===
class RewardConfig(BaseModel):
    points_per_currency: float = 1.0  # 1 point per 100 currency
    currency_per_point: float = 1.0  # 1 point = 1 currency on redeem
    min_redeem_points: int = 100
    expiry_days: int = 365


# === SUBSCRIPTION ===
class SubscriptionActionRequest(BaseModel):
    action: str  # approve, reject, suspend, activate
    note: Optional[str] = None
    plan: Optional[PlanTier] = None
    outlet_limit: Optional[int] = None


# === CATEGORY ===
class CategoryCreate(BaseModel):
    name: str
    parent: Optional[str] = None


# === ORGANIZATION / ROLES ===
class RoleScope(str, Enum):
    OUTLET = "outlet"
    MULTI_OUTLET = "multi_outlet"
    ALL_OUTLETS = "all_outlets"


class RequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class WorkflowTrigger(str, Enum):
    HIRING = "hiring"
    ROLE_CREATE = "role_create"
    EXPENSE = "expense"
    TRANSFER = "transfer"
    INVENTORY_ADJUST = "inventory_adjust"


class BusinessRoleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_role_id: Optional[str] = None
    scope: RoleScope = RoleScope.OUTLET
    outlet_ids: Optional[List[str]] = None
    permissions: List[str] = []
    can_create_employees: bool = False
    is_active: bool = True


class BusinessRoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parent_role_id: Optional[str] = None
    scope: Optional[RoleScope] = None
    outlet_ids: Optional[List[str]] = None
    permissions: Optional[List[str]] = None
    can_create_employees: Optional[bool] = None
    is_active: Optional[bool] = None


class ApprovalLevel(BaseModel):
    type: str  # role | system_role
    role_id: Optional[str] = None
    system_role: Optional[str] = None


class ApprovalWorkflowCreate(BaseModel):
    name: str
    trigger_type: WorkflowTrigger
    approval_levels: List[ApprovalLevel]
    is_active: bool = True


class ApprovalWorkflowUpdate(BaseModel):
    name: Optional[str] = None
    approval_levels: Optional[List[ApprovalLevel]] = None
    is_active: Optional[bool] = None


class HiringCandidate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    password: Optional[str] = None


class HiringRequestCreate(BaseModel):
    requested_role_id: str
    outlet_id: str
    candidate: HiringCandidate
    reason: Optional[str] = None
    reports_to_user_id: Optional[str] = None


class RoleRequestCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parent_role_id: Optional[str] = None
    scope: RoleScope = RoleScope.OUTLET
    outlet_ids: Optional[List[str]] = None
    permissions: List[str] = []
    can_create_employees: bool = False
    reason: Optional[str] = None


class ApprovalActionRequest(BaseModel):
    request_type: str  # hiring | role_create | expense | transfer
    request_id: str
    action: str  # approve | reject
    comments: Optional[str] = None


class TransferRequestCreate(BaseModel):
    user_id: str
    to_outlet_ids: List[str]
    to_role_id: Optional[str] = None
    reason: Optional[str] = None
    temporary_until: Optional[str] = None


class PermissionMatrixUpdate(BaseModel):
    permissions: List[str]


class DirectEmployeeCreate(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    password: str
    role_id: str
    outlet_ids: List[str] = []
    reports_to_user_id: Optional[str] = None
    date_of_joining: Optional[str] = None
    base_salary: Optional[float] = None


class EmployeeUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    role_id: Optional[str] = None
    outlet_ids: Optional[List[str]] = None
    reports_to_user_id: Optional[str] = None
    active: Optional[bool] = None
    employee_status: Optional[str] = None
    date_of_joining: Optional[str] = None
    base_salary: Optional[float] = None
