from logging.config import fileConfig
from sqlalchemy import engine_from_config
from sqlalchemy import pool
from alembic import context

# Centralized imports
from app.core.database import Base, DATABASE_URL
import app.models  # Ensure all models are imported so Base.metadata is populated

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Set the sqlalchemy.url from the app's DATABASE_URL
config.set_main_option("sqlalchemy.url", DATABASE_URL)

# Interpret the config file for Python logging.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# target_metadata for 'autogenerate' support
target_metadata = Base.metadata

# Tables intentionally NOT managed by Alembic in the current product baseline.
# They remain importable in the ORM, but are excluded from autogenerate and from
# the generated migrations so the schema matches the *active* running product:
#   - transport.*   : future-only module, not part of the first production release
#   - fee_structure : retired from active use
# To re-enable one later, remove it from this set and autogenerate a migration.
EXCLUDED_TABLES = {
    "buses", "routes", "stops", "student_transport",
    "bus_locations", "transport_notification_logs",
    "fee_structure",
}


def include_object(object, name, type_, reflected, compare_to):
    """Skip excluded tables (and their indexes) during autogenerate/compare."""
    if type_ == "table" and name in EXCLUDED_TABLES:
        return False
    if type_ == "index":
        tbl = getattr(object, "table", None)
        if tbl is not None and tbl.name in EXCLUDED_TABLES:
            return False
    return True

def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()

def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""
    from app.core.database import sync_engine
    
    # Ensure the URL is synchronous for the migration runner
    connectable = sync_engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()

if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
