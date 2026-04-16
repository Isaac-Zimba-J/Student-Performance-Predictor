"""Add semester_gpas table

Revision ID: 0002_semester_gpa
Revises: 0001_initial
Create Date: 2026-04-15 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = '0002_semester_gpa'
down_revision = '0001_initial'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('semester_gpas',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('student_id', sa.String(), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('semester', sa.Integer(), nullable=False),
        sa.Column('gpa', sa.Float(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=True),
        sa.ForeignKeyConstraint(['student_id'], ['student_profiles.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_semester_gpas_student_id', 'semester_gpas', ['student_id'])


def downgrade() -> None:
    op.drop_index('ix_semester_gpas_student_id', table_name='semester_gpas')
    op.drop_table('semester_gpas')
