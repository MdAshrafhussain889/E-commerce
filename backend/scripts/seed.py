"""Seed Super Hardware & Paints shop data."""

import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.models import Category, Inventory, Product, User, UserRole

CATEGORIES = [
    ("Paints", "paints", "Asian Paints emulsions, enamels, primers, and wall finishes"),
    ("Painting Tools", "painting-tools", "Brushes, rollers, trays, putty knives, and masking tape"),
    ("Plumbing", "plumbing", "Taps, valves, plumbing tools, and bathroom fittings"),
    ("Pipes & Fittings", "pipes-fittings", "PVC, CPVC, elbows, sockets, tees, and pipe fittings"),
    ("Electrical", "electrical", "Wires, switches, sockets, holders, and electrical fittings"),
    ("Hardware Tools", "hardware-tools", "Hammers, spanners, cutters, welding rods, and hand tools"),
    ("Buckets & Household", "buckets-household", "Buckets, mugs, ropes, mats, and home utility items"),
    ("Construction Material", "construction-material", "Putty, adhesives, cement accessories, and repair material"),
]

PRODUCTS = [
    ("Asian Paints Tractor Emulsion 10L", "Interior wall paint for budget home painting", "paints", Decimal("1450.00"), 8),
    ("Asian Paints Apcolite Premium Emulsion 10L", "Premium washable interior emulsion", "paints", Decimal("3250.00"), 4),
    ("Asian Paints Royale Luxury Emulsion 4L", "Luxury interior wall finish", "paints", Decimal("2850.00"), 3),
    ("Asian Paints Apex Exterior Emulsion 10L", "Exterior wall paint for weather protection", "paints", Decimal("3650.00"), 5),
    ("Asian Paints Metal Primer 1L", "Primer for metal surface preparation", "paints", Decimal("290.00"), 12),
    ("Asian Paints Enamel Paint 1L", "Gloss enamel paint for metal and wood", "paints", Decimal("420.00"), 10),
    ("Wall Putty 20kg Bag", "White cement based wall putty", "construction-material", Decimal("780.00"), 15),
    ("Tile Adhesive 20kg Bag", "Adhesive for tile fixing work", "construction-material", Decimal("520.00"), 9),
    ("Paint Brush 2 inch", "General purpose painting brush", "painting-tools", Decimal("65.00"), 35),
    ("Paint Brush 4 inch", "Wide brush for wall paint application", "painting-tools", Decimal("145.00"), 22),
    ("Paint Roller 9 inch", "Roller for fast wall painting", "painting-tools", Decimal("220.00"), 18),
    ("Paint Tray", "Plastic paint tray for rollers", "painting-tools", Decimal("120.00"), 14),
    ("Masking Tape 1 inch", "Tape for clean paint edges", "painting-tools", Decimal("55.00"), 40),
    ("PVC Pipe 1 inch 10ft", "Standard PVC plumbing pipe", "pipes-fittings", Decimal("180.00"), 28),
    ("PVC Elbow 1 inch", "PVC elbow pipe fitting", "pipes-fittings", Decimal("18.00"), 90),
    ("PVC Tee 1 inch", "PVC tee pipe fitting", "pipes-fittings", Decimal("25.00"), 75),
    ("CPVC Pipe 3/4 inch 10ft", "Hot and cold water pipe", "pipes-fittings", Decimal("320.00"), 16),
    ("Brass Tap Set Chrome", "Chrome finish tap for bathroom or basin", "plumbing", Decimal("650.00"), 7),
    ("Ball Valve 1 inch", "Water line control valve", "plumbing", Decimal("210.00"), 19),
    ("Bib Cock Tap", "Wall mounted water tap", "plumbing", Decimal("260.00"), 13),
    ("Finolex Wire 1.5 sqmm 90m", "Copper wire roll for house wiring", "electrical", Decimal("1899.00"), 6),
    ("Finolex Wire 2.5 sqmm 90m", "Copper wire roll for power wiring", "electrical", Decimal("2899.00"), 2),
    ("Anchor 6A Switch", "Modular electrical switch", "electrical", Decimal("85.00"), 120),
    ("Anchor 16A Socket", "Modular power socket", "electrical", Decimal("140.00"), 55),
    ("LED Bulb 9W", "Energy saving LED bulb", "electrical", Decimal("95.00"), 45),
    ("Taparia Spanner Set 8pc", "Chrome vanadium spanner set", "hardware-tools", Decimal("899.00"), 11),
    ("Claw Hammer 500g", "Hammer with grip handle", "hardware-tools", Decimal("360.00"), 17),
    ("Cutting Plier 8 inch", "Electrical and hardware cutting plier", "hardware-tools", Decimal("280.00"), 20),
    ("Welding Rod 3.15mm Pack", "General purpose welding electrode pack", "hardware-tools", Decimal("420.00"), 5),
    ("Plastic Bucket 20L", "Heavy duty household bucket", "buckets-household", Decimal("180.00"), 30),
    ("Plastic Mug 1L", "Bathroom and household mug", "buckets-household", Decimal("45.00"), 60),
    ("Nylon Rope 10m", "Utility rope for home and shop use", "buckets-household", Decimal("95.00"), 25),
]

OLD_DEMO_PRODUCTS = {
    "Bosch Drill Machine 500W",
    "Stanley Hammer 500g",
    "Finolex Wire 1.5mm (90m)",
    "Jaquar Tap Set Chrome",
    "Black+Decker Angle Grinder",
    "Taparia Spanner Set 8pc",
    "Anchor Switch 16A",
    "Supreme PVC Pipe 1 inch",
}

OLD_DEMO_CATEGORY_SLUGS = {"power-tools", "hand-tools"}


def ensure_user(db, email: str, password: str, name: str, role: UserRole, phone: str | None = None) -> None:
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.name = name
        user.role = role
        user.is_verified = True
        if phone:
            user.phone = phone
        return

    db.add(
        User(
            email=email,
            password_hash=hash_password(password),
            name=name,
            phone=phone,
            role=role,
            is_verified=True,
        )
    )


def seed() -> None:
    db = SessionLocal()
    try:
        ensure_user(db, "admin@superhardware.com", "admin12345", "Super Hardware & Paints Admin", UserRole.admin)
        ensure_user(db, "customer@example.com", "customer123", "Demo Customer", UserRole.user, "9876543210")
        db.flush()

        category_map: dict[str, Category] = {}
        for name, slug, description in CATEGORIES:
            category = db.query(Category).filter(Category.slug == slug).first()
            if category is None:
                category = Category(name=name, slug=slug, description=description)
                db.add(category)
                db.flush()
            else:
                category.name = name
                category.description = description
            category_map[slug] = category

        for product in db.query(Product).filter(Product.name.in_(OLD_DEMO_PRODUCTS)).all():
            product.is_active = False

        for old_category in db.query(Category).filter(Category.slug.in_(OLD_DEMO_CATEGORY_SLUGS)).all():
            for product in old_category.products:
                product.category_id = None
            db.delete(old_category)

        for name, description, slug, price, stock in PRODUCTS:
            product = db.query(Product).filter(Product.name == name).first()
            if product is None:
                product = Product(
                    name=name,
                    description=description,
                    price=price,
                    category_id=category_map[slug].id,
                    image_url=None,
                    is_active=True,
                )
                db.add(product)
                db.flush()
            else:
                product.description = description
                product.price = price
                product.category_id = category_map[slug].id
                product.image_url = None
                product.is_active = True

            if product.inventory is None:
                db.add(Inventory(product_id=product.id, quantity_available=stock, quantity_reserved=0))
            else:
                product.inventory.quantity_available = stock

        db.commit()
        print("Super Hardware & Paints seed complete.")
        print("Admin: admin@superhardware.com / admin12345")
        print("Customer: customer@example.com / customer123")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
